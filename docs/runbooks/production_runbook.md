# SOC Production Operations Runbook — LitSecure Sentinel

**Classification:** Restricted / Operations
**Target Audience:** DevOps Engineers, System Administrators, Security Operations Center (SOC) Managers

---

## 1. Setup & Prerequisites
To deploy or host the **LitSecure Sentinel** platform, ensure the hosting environment satisfies the following baseline requirements:

- **Runtime:** Node.js v22.x or later.
- **DBMS:** PostgreSQL 15/16 (e.g. Supabase connection pool) as the primary data store.
- **Local Fallback:** SQLite 3 (automatically created as `data/sentinel.db` if primary DB is unavailable).
- **SSL/TLS:** Enforce HTTP/2 or HTTP/1.1 TLS v1.3 with a valid certificate.
- **Port:** Server listens on port `3000` (or `PORT` variable).

### Required Environment Variables
Create `/app/.env` (or pass via Kubernetes ConfigMap/Secrets):
```ini
NODE_ENV=production
PORT=3000
JWT_SECRET=super-secret-jwt-signing-key-minimum-32-characters
REFRESH_TOKEN_SECRET=super-secret-refresh-rotation-key-minimum-32-characters
DATABASE_URL=postgresql://user:password@endpoint:5432/dbname?sslmode=require

# External threat integrations (optional heuristics fallback if empty)
VIRUSTOTAL_API_KEY=your-virustotal-api-key
ABUSEIPDB_API_KEY=your-abuseipdb-api-key
```

---

## 2. Server Deployment & Initialization

### Docker Container Run
To launch the prebuilt container image:
```bash
docker run -d \
  --name litsecure-sentinel \
  -p 3000:3000 \
  --env-file .env \
  -v sentinel-data:/app/data \
  -v sentinel-uploads:/app/uploads \
  --read-only=false \
  --cap-drop=ALL \
  litsecure-sentinel:latest
```

### Manual Database Migrations
On startup, the server automatically boots migrations to register missing tables (`refresh_tokens`, `vulnerabilities`, `server_events`). 
To manually inspect or trigger migrations:
```bash
# Run schema build scripts
npm run db:migrate
```

---

## 3. Monitoring Checklist & Health Verifications

| Metric / Endpoint | Expected Response | Description | Action on Failure |
|---|---|---|---|
| `GET /api/health/live` | `{"status":"UP","timestamp":"..."}` | Liveness check | Restart task/container. |
| `GET /metrics` | Prometheus exposition text | App stats & analytics metrics | Alert DevOps if timeouts occur. |
| DB connection pool | Verified count in logs | DB activity | Verify postgres connection URL. |
| WebSockets `/ws` | HTTP 101 Switching Protocols | Real-time incident logs stream | Check Ingress configuration headers. |

### Accessing Logs
To fetch the container stdout logs:
```bash
docker logs --tail 100 -f litsecure-sentinel
```
For Kubernetes setups:
```bash
kubectl logs -f deployment/sentinel-deployment -n litsecure -c sentinel-app
```

---

## 4. Routine Maintenance

### A. Refresh Token Cleanup
The `refresh_tokens` database table handles RTR (Refresh Token Rotation). Hashed tokens expire in 7 days. To prevent the table from growing indefinitely, a cron task runs automatically, but you can trigger it manually:
```bash
# Exec command in the container
node dist/scripts/cleanup-tokens.js
```

### B. Database Vacuuming (RDS Postgres)
To optimize index performance and reclaim storage space, run weekly:
```sql
VACUUM ANALYZE vulnerabilities;
VACUUM ANALYZE refresh_tokens;
VACUUM ANALYZE server_events;
```

### C. Security Key Rotation
Rotate the `JWT_SECRET` and `REFRESH_TOKEN_SECRET` every 90 days:
1. Generate new 32-character random strings.
2. Update the Kubernetes Secrets or ECS environment configurations.
3. Perform a rolling restart. All active user sessions will gracefully switch to refresh token logs or request re-login.

---

## 5. Troubleshooting Guide

### Issue 1: Server reports "SQLite database is locked" (Fallback mode)
* **Root Cause:** Multiple Node processes attempting to write to the local SQLite fallback database `sentinel.db` simultaneously.
* **Resolution:** Ensure the container is configured to use the primary PostgreSQL/Supabase database (verify `DATABASE_URL` is set). In local dev, configure WAL (Write-Ahead Logging) mode on SQLite:
  ```sql
  PRAGMA journal_mode=WAL;
  ```

### Issue 2: VirusTotal queries failing
* **Root Cause:** Rate limits exceeded on free API keys, or invalid API key.
* **Resolution:** Sentinel falls back automatically to local static scanning (magic bytes, YARA regex rule sets, MD5/SHA256 hash checks) without throwing 500 errors. Verify the API key in configuration settings if you require cloud threat lookup.

### Issue 3: WebSocket analyst client fails to connect
* **Root Cause:** Load balancer or Ingress proxy does not forward `Upgrade` headers.
* **Resolution:** Ensure Nginx ingress rules include:
  ```nginx
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
