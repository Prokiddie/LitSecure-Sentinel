# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install all deps (including dev) for build
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Security: run as non-root user
RUN addgroup -g 1001 -S litsecure && \
    adduser  -u 1001 -S litsecure -G litsecure

# Install dumb-init (proper PID 1 / signal forwarding)
RUN apk add --no-cache dumb-init wget

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artefacts from builder
COPY --from=builder /app/dist      ./dist
COPY --from=builder /app/server    ./server
COPY --from=builder /app/src/types.ts ./src/types.ts
COPY server.ts   .
COPY tsconfig.json .

# Ensure data dir is writable by litsecure user (SQLite fallback)
RUN mkdir -p /app/data /app/uploads && \
    chown -R litsecure:litsecure /app

# Drop to non-root
USER litsecure

EXPOSE 3000

# Kubernetes-ready health probes
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health/live || exit 1

# Use dumb-init to handle SIGTERM correctly (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
