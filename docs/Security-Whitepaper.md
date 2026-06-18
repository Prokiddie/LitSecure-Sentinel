# LitSecure Sentinel — Security Whitepaper
**Version 1.0 | June 2026 | CONFIDENTIAL**

---

## 1. Overview

This document describes the security architecture of LitSecure Sentinel, the security controls implemented to protect national cybersecurity incident data, and the compliance posture of the platform. It is intended for technical reviewers, government IT departments, and security auditors evaluating the platform for deployment.

---

## 2. Authentication Architecture

### 2.1 Password-Based Authentication
- **Algorithm:** bcrypt with 12 work factor rounds (OWASP recommended minimum)
- **Storage:** Password hashes only — plaintext passwords never stored or logged
- **Transmission:** HTTPS only (TLS 1.2+); passwords never appear in query strings or logs

### 2.2 Multi-Factor Authentication (TOTP)
- **Standard:** RFC 6238 Time-Based One-Time Passwords
- **Algorithm:** HMAC-SHA1, 6-digit codes, 30-second window
- **Library:** otplib v12 (audited, FIDO-aligned)
- **Enrollment:** QR code scan (Google Authenticator, Authy, 1Password compatible)
- **Clock Tolerance:** ±1 time step (30s tolerance for clock skew)
- **Backup:** 8 single-use recovery codes generated at enrollment
- **Enforcement:** Configurable per-role; admin/analyst accounts require MFA

### 2.3 Token Management
- **Access Tokens:** JSON Web Tokens (JWT, RS256 or HS256 configurable), 8-hour default expiry
- **Token Revocation:** SHA-256 hashed tokens stored in `revoked_tokens` table; checked on every authenticated request — logout is immediately effective
- **Brute Force:** 5 failed login attempts trigger 15-minute account lockout; tracked in `login_attempts` table
- **Session Security:** Tokens transmitted via `Authorization: Bearer` header only; never in cookies or URL parameters

---

## 3. Authorization Model

### 3.1 Role-Based Access Control (RBAC)
LitSecure implements a 9+1 role hierarchy:

| Role | Access Level | Typical User |
|---|---|---|
| `super_admin` | Full system + billing | Platform owner |
| `admin` | All operations + user mgmt | MACRA IT Admin |
| `gov_admin` | Government modules | Ministry official |
| `soc_manager` | SOC + analyst oversight | CERT team lead |
| `analyst` | Investigation + intel | MACERT analyst |
| `investigator` | Evidence + case management | Police CID |
| `org_admin` | Own org's data | Telco security manager |
| `org_user` | Report submission | Staff member |
| `auditor` | Read-only + audit logs | Compliance officer |
| `citizen` | Public portal only | General public |

### 3.2 Route-Level Enforcement
All protected endpoints use the `requireAuth` middleware. Sensitive endpoints additionally use `requireRole()` to enforce minimum role requirements. Authorization is applied at the route handler level, not just the API gateway.

---

## 4. Data Protection

### 4.1 Data at Rest
- **Current (Development):** SQLite database file with WAL mode; filesystem-level encryption recommended
- **Production Target:** PostgreSQL with row-level security (RLS) policies per organization; full schema in `migrations/001_initial.sql`
- **Evidence Files:** SHA-256 integrity hashes computed at upload time; re-verified on demand via `POST /api/evidence/:id/verify`

### 4.2 Data in Transit
- All API communication over HTTPS (TLS 1.2+)
- CORS configured to allow only the application origin
- SSE streams authenticated via short-lived URL tokens
- WebSocket connections (War Room) validated against JWT

### 4.3 Evidence Integrity
Evidence files use a **chain of custody** model:
1. SHA-256 hash computed at upload time and stored immutably
2. Every access, transfer, and review adds a signed custody entry with actor identity, timestamp, and IP address
3. Re-verification endpoint recomputes hash and reports mismatches (tampering detection)

---

## 5. Audit Logging

### 5.1 Coverage
Every authenticated mutation is logged: incident creates/updates, evidence uploads, user management, configuration changes, login/logout events, MFA changes, and role assignments.

### 5.2 Tamper-Evident Chain
Audit logs implement a **SHA-256 hash chain** (blockchain-style):
- Each log entry's hash is computed from its content + the previous entry's hash
- The chain is anchored at a `GENESIS` constant
- Any modification, deletion, or insertion breaks the chain
- `GET /api/audit-logs/verify` recomputes and reports all violations

### 5.3 Export
Audit logs export to:
- **JSON** (for SIEM ingestion — Splunk, Elastic, QRadar compatible)
- **CSV** (for compliance reporting and spreadsheet analysis)
- Protected by `auditor` / `admin` role requirement

---

## 6. Network Security

### 6.1 HTTP Security Headers (Helmet.js)
| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | DENY | Clickjacking prevention |
| `X-Content-Type-Options` | nosniff | MIME sniffing prevention |
| `Strict-Transport-Security` | max-age=31536000 | Force HTTPS |
| `X-XSS-Protection` | 1; mode=block | Legacy XSS prevention |
| `Referrer-Policy` | no-referrer | Privacy protection |

### 6.2 Rate Limiting
| Endpoint Group | Limit | Window |
|---|---|---|
| `POST /api/auth/login` | 10 requests | 15 minutes |
| `POST /api/auth/register` | 5 requests | 1 hour |
| `POST /api/public/*` | 20 requests | 15 minutes |
| All `/api/*` | 500 requests | 15 minutes |

### 6.3 Input Validation
- All public and authenticated inputs validated with **Zod** schemas before processing
- File uploads restricted by type; SHA-256 computed for integrity

---

## 7. Secret Management

| Secret | Handling |
|---|---|
| `JWT_SECRET` | Environment variable; minimum 256-bit random; never logged or exposed in API responses |
| `GEMINI_API_KEY` | Environment variable; used server-side only |
| `AFRICAS_TALKING_API_KEY` | Environment variable; never transmitted to frontend |
| `MFA secrets` | Stored in `users.mfa_secret` (base32); never returned by API after enrollment |
| Default credentials | **Removed from all files** — `.env.example` contains empty placeholders only |

**Production Recommendation:** Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, or Azure Key Vault) rather than `.env` files.

---

## 8. Compliance Posture

| Framework | Alignment Status |
|---|---|
| **Malawi ETCSA 2016** | ✅ Platform enables mandatory incident reporting |
| **Malawi Data Protection Act 2024** | 🟡 In progress — data residency and consent controls being added |
| **NIST Cybersecurity Framework** | 🟡 Identify + Protect + Detect implemented; Respond + Recover in progress |
| **ISO/IEC 27001** | 🔴 Target for Phase 2; gap analysis needed |
| **GDPR** | 🔴 Applicable if EU personal data processed; review needed for NGO deployments |
| **AU Malabo Convention** | 🟡 Aligns with incident reporting obligations |

---

## 9. Known Limitations & Roadmap

| Issue | Severity | Remediation | Target |
|---|---|---|---|
| SQLite → PostgreSQL | High | Migration file ready (`001_initial.sql`) | Phase 1 |
| Database encryption at rest | High | SQLCipher or PostgreSQL TDE | Phase 1 |
| Evidence upload malware scan | High | VirusTotal API or ClamAV integration | Phase 1 |
| Penetration test | Critical | Engage certified Malawi/SADC pen tester | Phase 1 |
| ISO 27001 certification | Medium | Gap analysis → remediation → audit | Phase 2 |
| TOTP backup code storage | Medium | Hash and store backup codes securely | Phase 1 |
| CSP headers | Low | Enable after Vite migration complete | Phase 1 |

---

## 10. Security Contact

For responsible disclosure of vulnerabilities or security questions:
**security@litsecure.mw** *(once domain is registered)*

This whitepaper will be updated with each major release. Version history maintained in Git.

---

*LitSecure Systems | Lilongwe, Malawi | June 2026*
