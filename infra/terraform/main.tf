terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "litsecure-sentinel-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "litsecure-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Environment = "Production"
      Project     = "LitSecure Sentinel"
      ManagedBy   = "Terraform"
    }
  }
}

# ─── VPC Configuration ────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "litsecure-prod-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  database_subnets = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway  = false
  enable_vpn_gateway   = false
  enable_dns_hostnames = true
  enable_dns_support   = true

  create_database_subnet_group = true
}

# ─── Security Groups ──────────────────────────────────────────────────────────
resource "aws_security_group" "alb_sg" {
  name        = "litsecure-alb-sg"
  description = "Allow inbound public traffic to ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS public"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs_tasks_sg" {
  name        = "litsecure-ecs-tasks-sg"
  description = "Allow traffic from ALB only"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db_sg" {
  name        = "litsecure-db-sg"
  description = "Allow traffic to RDS from ECS tasks"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ─── Relational Database Service (PostgreSQL) ─────────────────────────────────
resource "aws_db_instance" "postgres" {
  identifier             = "litsecure-prod-db"
  engine                 = "postgres"
  engine_version         = "16.1"
  instance_class         = "db.r6g.large"
  allocated_storage      = 50
  max_allocated_storage  = 500
  storage_type           = "gp3"
  db_name                = "sentinel"
  username               = "db_admin"
  password               = var.db_password
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  multi_az               = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "litsecure-db-final-snapshot"
  deletion_protection    = true
  storage_encrypted      = true
}

# ─── Application Load Balancer ────────────────────────────────────────────────
resource "aws_lb" "main" {
  name               = "litsecure-prod-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = module.vpc.public_subnets
  ip_address_type    = "ipv4"
}

resource "aws_lb_target_group" "app" {
  name        = "litsecure-prod-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    path                = "/api/health/live"
    port                = "3000"
    protocol            = "HTTP"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ─── ECS Cluster & Fargate Service ────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "litsecure-prod-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "litsecure-sentinel"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "sentinel-app"
      image     = "${var.ecr_repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" },
        { name = "DATABASE_URL", value = "postgresql://${aws_db_instance.postgres.username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}" }
      ]
      secrets = [
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "REFRESH_TOKEN_SECRET", valueFrom = aws_secretsmanager_secret.refresh_token_secret.arn }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "sentinel"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = "litsecure-prod-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 3
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks_sg.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "sentinel-app"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.https]
}

# ─── CloudWatch Logging ───────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/litsecure-sentinel"
  retention_in_days = 90
}

# ─── Secrets Manager ──────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "litsecure-prod-jwt-secret"
  description = "JWT Signing Key for LitSecure Sentinel"
}

resource "aws_secretsmanager_secret" "refresh_token_secret" {
  name        = "litsecure-prod-refresh-token-secret"
  description = "Refresh Token Rotation key for LitSecure Sentinel"
}

# ─── IAM Roles ────────────────────────────────────────────────────────────────
resource "aws_iam_role" "ecs_execution_role" {
  name = "litsecure-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "secrets_policy" {
  name = "litsecure-ecs-secrets-policy"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "kms:Decrypt"
        ]
        Resource = [
          aws_secretsmanager_secret.jwt_secret.arn,
          aws_secretsmanager_secret.refresh_token_secret.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task_role" {
  name = "litsecure-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# ─── Variables Definition ─────────────────────────────────────────────────────
variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "acm_certificate_arn" {
  type        = string
  description = "ARN of the SSL/TLS Certificate in AWS Certificate Manager"
}

variable "ecr_repository_url" {
  type        = string
  description = "URL of the Amazon ECR repository housing sentinel images"
}

# ─── Output Configurations ────────────────────────────────────────────────────
output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "DNS endpoint of the Application Load Balancer"
}

output "rds_endpoint" {
  value       = aws_db_instance.postgres.endpoint
  description = "Endpoint address of the RDS PostgreSQL instance"
}
