# Security Policy — LitSecure Sentinel

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.4.x   | ✅ Active  |
| < 1.4   | ❌ EOL     |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email **security@litsecure.mw** with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Optional: suggested fix

We will acknowledge within **48 hours** and aim to patch within **7 days** for critical issues.

## Security Controls

### Authentication
- JWT-based with **8h expiry** (configurable)
- **Logout revokes tokens** — SHA-256 hash stored in `revoked_tokens` blocklist
- **Brute-force lockout**: 5 failed attempts → 15 minute lockout
- **TOTP MFA** available per-user (otplib)
- **bcrypt** password hashing (rounds=12)

### Authorisation
- Role-Based Access Control: `super_admin › admin › soc_manager › gov_admin › investigator › analyst › auditor › citizen`
- Terminal commands restricted to `admin/super_admin/soc_manager/gov_admin`
- Audit log written for every authenticated mutation

### Transport Security
- **HTTPS enforced** in production (HSTS: `max-age=31536000; includeSubDomains`)
- **Helmet.js** security headers on all responses
- **Content-Security-Policy** enabled in production
- **CORS** restricted to `ALLOWED_ORIGINS` allowlist in production

### API Security
- Rate limiting: 120 req/15min (general), 10 req/15min (auth), 20 req/hr (incident submit)
- Body size limit: 15MB
- Zod input validation on all authenticated routes
- Parameterised queries only — no string-concatenated SQL

### Data Security
- All secrets via environment variables — never hardcoded
- `.env.local` excluded from git via `.gitignore`
- Evidence files stored with SHA-256 chain-of-custody
- Audit logs are immutable (append-only enforced in DB)

### Infrastructure
- Docker runs as **non-root user** (`litsecure` uid=1001)
- `dumb-init` used for proper SIGTERM handling
- Container image scanned by **Trivy** in CI pipeline
- Weekly **Snyk** dependency audit
- **Gitleaks** secret scanning on every commit

## Known Limitations (Pre-Production)

| Item | Status |
|------|--------|
| Rate limiter is in-memory (resets on restart) | ⚠️ Add Redis for distributed deploy |
| SQLite is single-writer (concurrency limited) | ⚠️ Migrate to PostgreSQL/Supabase primary |
| No DAST (dynamic scanning) in CI yet | 📋 OWASP ZAP planned |

## Responsible Disclosure Timeline

- **Day 0**: Vulnerability reported to security@litsecure.mw
- **Day 1–2**: Acknowledgement sent
- **Day 3–7**: Patch developed
- **Day 7–14**: Patch tested and deployed to production
- **Day 30**: Public disclosure (if resolved)
