/**
 * LitSecure Sentinel — Cyber Intelligence API Routes
 *
 * Proxies public cyber-intelligence APIs server-side to:
 *  - Avoid browser CORS restrictions
 *  - Add auth gating (JWT required)
 *  - Rate-limit external calls
 *
 * Endpoints:
 *   GET  /api/cyber/ip/:address        → IP geolocation + ASN (ip-api.com)
 *   GET  /api/cyber/dns/:domain/:type  → DNS records (dns.google DoH)
 *   GET  /api/cyber/rdap/:domain       → WHOIS/RDAP (rdap.org)
 *   POST /api/cyber/headers            → HTTP response headers of target
 *   GET  /api/cyber/certs/:domain      → SSL cert transparency (crt.sh)
 *   POST /api/cyber/portscan           → TCP port probe (server-side)
 *   POST /api/cyber/hash               → File hash calculator (SHA-256)
 */

import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import net from "net";
import { queries, generateId } from "../db/index.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// ─── Helper: forward JSON fetch ────────────────────────────────────────────
async function proxyFetch(url: string, timeoutMs = 8000): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "LitSecure-Sentinel/1.4 (Malawi MACERT)" },
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── 1. IP Geolocation + ASN ──────────────────────────────────────────────
router.get("/ip/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  // Basic IP validation
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (!ipv4.test(address) && !ipv6.test(address)) {
    return res.status(400).json({ error: "Invalid IP address" });
  }
  try {
    const geoPromise = proxyFetch(
      `http://ip-api.com/json/${address}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting,query`
    );

    let abusePromise = Promise.resolve(null);
    const abuseKey = process.env.ABUSEIPDB_API_KEY;
    if (abuseKey && abuseKey !== "your_abuseipdb_api_key_here") {
      abusePromise = fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(address)}&maxAgeInDays=90&verbose=true`, {
        headers: {
          "Key": abuseKey,
          "Accept": "application/json"
        },
        signal: AbortSignal.timeout(5000)
      }).then(async r => {
        if (r.ok) {
          const body = await r.json();
          return body?.data || null;
        }
        return null;
      }).catch(err => {
        console.error("AbuseIPDB call failed:", err);
        return null;
      });
    }

    const [geoResult, abuseResult] = await Promise.allSettled([geoPromise, abusePromise]);

    if (geoResult.status === "rejected") {
      throw geoResult.reason;
    }

    const geoData = geoResult.value;
    const abuseData = abuseResult.status === "fulfilled" ? abuseResult.value : null;

    res.json({
      ...geoData,
      abuse: abuseData
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ─── 2. DNS Lookup (Google DoH) ────────────────────────────────────────────
router.get("/dns/:domain/:type?", async (req: Request, res: Response) => {
  const { domain, type = "A" } = req.params;
  const validTypes = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA", "PTR"];
  const dnsType = validTypes.includes(type.toUpperCase()) ? type.toUpperCase() : "A";
  try {
    const data = await proxyFetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${dnsType}`
    );
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ─── 3. WHOIS / RDAP ──────────────────────────────────────────────────────
router.get("/rdap/:domain", async (req: Request, res: Response) => {
  const { domain } = req.params;
  try {
    // Try rdap.org first, fallback to ARIN
    const data = await proxyFetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
    res.json(data);
  } catch {
    try {
      const data = await proxyFetch(`https://rdap.arin.net/registry/domain/${encodeURIComponent(domain)}`);
      res.json(data);
    } catch (err: any) {
      res.status(502).json({ error: err.message });
    }
  }
});

// ─── 4. HTTP Headers Analysis ─────────────────────────────────────────────
router.post("/headers", async (req: Request, res: Response) => {
  const { url } = req.body as { url: string };
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Valid HTTP/HTTPS URL required" });
  }
  try {
    const target = new URL(url);
    const response = await fetch(target.toString(), {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
      headers: { "User-Agent": "LitSecure-Sentinel/1.4 (MACERT Recon)" },
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });

    // Security header analysis
    const securityHeaders = {
      "strict-transport-security": headers["strict-transport-security"] ? "✅ Present" : "⚠️ Missing",
      "content-security-policy":   headers["content-security-policy"]   ? "✅ Present" : "⚠️ Missing",
      "x-frame-options":           headers["x-frame-options"]           ? "✅ Present" : "⚠️ Missing",
      "x-content-type-options":    headers["x-content-type-options"]    ? "✅ Present" : "⚠️ Missing",
      "referrer-policy":           headers["referrer-policy"]           ? "✅ Present" : "⚠️ Missing",
      "permissions-policy":        headers["permissions-policy"]        ? "✅ Present" : "⚠️ Missing",
    };

    res.json({
      url: target.toString(),
      status: response.status,
      statusText: response.statusText,
      headers,
      securityAnalysis: securityHeaders,
      server: headers["server"] || "Unknown",
      poweredBy: headers["x-powered-by"] || "Not disclosed",
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ─── 5. SSL Certificate Transparency (crt.sh) ────────────────────────────
router.get("/certs/:domain", async (req: Request, res: Response) => {
  const { domain } = req.params;
  try {
    const data = await proxyFetch(
      `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
      10000
    );
    // Return last 20 certs only
    const certs = Array.isArray(data) ? data.slice(0, 20).map((c: any) => ({
      id:        c.id,
      issuer:    c.issuer_name,
      subject:   c.name_value,
      notBefore: c.not_before,
      notAfter:  c.not_after,
      loggedAt:  c.entry_timestamp,
    })) : [];
    res.json({ domain, count: certs.length, certs });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ─── 6. Port Scanner (TCP connect) ────────────────────────────────────────
router.post("/portscan", async (req: Request, res: Response) => {
  const { host, ports } = req.body as { host: string; ports: number[] };
  if (!host || !ports?.length) {
    return res.status(400).json({ error: "host and ports[] required" });
  }
  // Sanitize: max 20 ports, valid range
  const sanitized = ports.slice(0, 20).filter(p => p > 0 && p < 65536);

  const scanPort = (port: number): Promise<{ port: number; status: "open" | "closed" | "filtered"; banner?: string }> =>
    new Promise(resolve => {
      const sock = new net.Socket();
      let banner = "";
      const timeout = 1500;
      sock.setTimeout(timeout);
      sock.on("connect", () => {
        resolve({ port, status: "open", banner: banner.trim() || undefined });
        sock.destroy();
      });
      sock.on("data", d => { banner += d.toString().slice(0, 80); });
      sock.on("timeout", () => { resolve({ port, status: "filtered" }); sock.destroy(); });
      sock.on("error", (e: any) => {
        resolve({ port, status: e.code === "ECONNREFUSED" ? "closed" : "filtered" });
      });
      sock.connect(port, host);
    });

  try {
    const results = await Promise.all(sanitized.map(scanPort));
    res.json({ host, scanned: results.length, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. Hash Calculator ────────────────────────────────────────────────────
router.post("/hash", (req: Request, res: Response) => {
  const { data, algorithm = "sha256" } = req.body as { data: string; algorithm?: string };
  const validAlgos = ["sha256", "sha1", "sha512", "md5"];
  if (!data) return res.status(400).json({ error: "data field required" });
  const algo = validAlgos.includes(algorithm) ? algorithm : "sha256";
  try {
    const hash = createHash(algo).update(data, "utf8").digest("hex");
    res.json({ algorithm: algo.toUpperCase(), hash, length: hash.length, inputLength: data.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 8. Threat Watchlist ───────────────────────────────────────────────────
router.get("/watchlist", async (req: Request, res: Response) => {
  try {
    const items = queries.getWatchlist.all();
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/watchlist", requireRole("admin", "analyst", "soc_manager"), async (req: Request, res: Response) => {
  const { type, value, risk_level, reason } = req.body;
  if (!type || !value || !risk_level || !reason) {
    return res.status(400).json({ error: "type, value, risk_level, and reason are required" });
  }
  if (!["phone", "ip", "domain"].includes(type)) {
    return res.status(400).json({ error: "type must be phone, ip, or domain" });
  }
  if (!["Medium", "High", "Critical"].includes(risk_level)) {
    return res.status(400).json({ error: "risk_level must be Medium, High, or Critical" });
  }
  try {
    const id = generateId("wtc");
    queries.insertWatchlist.run({
      id,
      type,
      value: String(value).trim(),
      risk_level,
      reason,
      created_at: new Date().toISOString(),
    });
    res.status(201).json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/watchlist/:id", requireRole("admin", "analyst", "soc_manager"), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    queries.deleteWatchlist.run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /api/cyber/threat-score/:indicator ──────────────────────────────────
// Returns a 0-100 unified threat score for an IP or domain.
// Uses AbuseIPDB for IPs, falls back to ip-api data if no API key.
router.get("/threat-score/:indicator", requireRole("admin", "analyst", "investigator", "soc_manager"), async (req: Request, res: Response) => {
  const { indicator } = req.params;
  if (!indicator) return res.status(400).json({ error: "indicator required" });

  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(indicator);
  let score = 0;
  let detail: Record<string, any> = {};

  try {
    if (isIp) {
      const abuseKey = process.env.ABUSEIPDB_API_KEY;
      if (abuseKey && abuseKey !== "YOUR_ABUSEIPDB_KEY_HERE") {
        // AbuseIPDB lookup — must use native fetch to send custom Key header
        const abuseRes = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(indicator)}&maxAgeInDays=90`, {
          headers: { Key: abuseKey, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (abuseRes.ok) {
          const abuseData = await abuseRes.json();
          score = abuseData.data?.abuseConfidenceScore ?? 0;
          detail = { source: "AbuseIPDB", country: abuseData.data?.countryCode, isp: abuseData.data?.isp, totalReports: abuseData.data?.totalReports };
          // Persist to threat_intel if row exists
          try {
            queries.updateThreatEnrichment.run({ value: indicator, abuse_score: score, vt_positives: 0, vt_total: 0, geo_country: abuseData.data?.countryCode ?? "", geo_isp: abuseData.data?.isp ?? "", last_enriched: new Date().toISOString() });
          } catch {}
        } else {
          // AbuseIPDB key rejected (401/403) — fall through to free ip-api
          const ipData = await proxyFetch(`http://ip-api.com/json/${indicator}?fields=status,countryCode,isp,proxy,hosting`);
          const isProxy = ipData?.proxy || ipData?.hosting || false;
          score = isProxy ? 65 : 12;
          detail = { source: "ip-api.com", country: ipData?.countryCode, isp: ipData?.isp, proxy: isProxy };
        }
      } else {
        // No key set — use ip-api.com free lookup
        const ipData = await proxyFetch(`http://ip-api.com/json/${indicator}?fields=status,countryCode,isp,proxy,hosting`);
        const isProxy = ipData?.proxy || ipData?.hosting || false;
        score = isProxy ? 65 : 12;
        detail = { source: "ip-api.com", country: ipData?.countryCode, isp: ipData?.isp, proxy: isProxy };
      }
    } else {
      // Domain: check VirusTotal if key available, else heuristic
      const vtKey = process.env.VIRUSTOTAL_API_KEY;
      if (vtKey && vtKey !== "YOUR_VT_KEY_HERE") {
        const vtRes = await fetch(`https://www.virustotal.com/api/v3/domains/${encodeURIComponent(indicator)}`, {
          headers: { "x-apikey": vtKey },
          signal: AbortSignal.timeout(10000),
        });
        if (vtRes.ok) {
          const vtData = await vtRes.json();
          const stats = vtData.data?.attributes?.last_analysis_stats ?? {} as Record<string, number>;
          const malicious: number = (stats.malicious as number) ?? 0;
          const total: number = (Object.values(stats) as number[]).reduce((s: number, v: number) => s + (Number(v) || 0), 0);
          score = total > 0 ? Math.round((malicious / total) * 100) : 0;
          detail = { source: "VirusTotal", malicious, total };
        }
      } else {
        // Heuristic: known bad TLDs / lookalike domains get higher base score
        const suspiciousTLDs = [".online", ".xyz", ".tk", ".ml", ".ga", ".cf", ".gq"];
        const isSuspicious = suspiciousTLDs.some(t => indicator.endsWith(t)) || indicator.includes("portal-portal") || indicator.includes("mra-");
        score = isSuspicious ? 75 : 15;
        detail = { source: "heuristic", suspicious: isSuspicious };
      }
    }
  } catch (err: any) {
    // Don't fail — just return 0 score
    detail = { source: "error", message: err.message };
  }

  return res.json({ indicator, score, isIp, ...detail });
});

export default router;

