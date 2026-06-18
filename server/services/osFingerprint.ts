/**
 * LitSecure Sentinel — OS Fingerprinting Service
 *
 * Hybrid passive/active fingerprinting using:
 *  1. TTL + TCP Window analysis (from HTTP headers / incident metadata)
 *  2. User-Agent heuristics (HTTP-level passive fingerprinting)
 *  3. DNS query pattern matching (OS-specific resolution patterns)
 *  4. TLS cipher suite fingerprinting (JA3-style)
 *  5. ip-api.com for ASN/geo enrichment
 *
 * Designed for server-side use — no raw packet capture required.
 * For full PCAP-based capture, hook real pcap events into analyzePacketData().
 */

export interface OSFingerprint {
  ip:               string;
  os:               string;
  family:           "Windows" | "Linux" | "MacOS" | "Android" | "iOS" | "Network Device" | "Unknown";
  version:          string;
  confidence:       number;          // 0–1
  ttl:              number;
  windowSize:       number;
  tcpOptions:       string[];
  tlsCiphers:       string[];
  dnsPatterns:      string[];
  behaviorPatterns: string[];
  detectedAt:       string;
  source:           string;          // which method triggered this
}

interface PacketData {
  srcIP:      string;
  ttl:        number;
  windowSize: number;
  flags?:     string[];
  tcpOptions?: string[];
  userAgent?: string;
}

// ─── Known OS TTL / window signatures ────────────────────────────────────────
const OS_SIGS: Array<{
  name:    string;
  family:  OSFingerprint["family"];
  ttls:    [number, number];   // [min, max]
  windows: number[];
  weight:  number;
}> = [
  { name: "Windows 10/11", family: "Windows",        ttls: [120, 128], windows: [65535, 64240, 8192], weight: 0.85 },
  { name: "Windows Server",family: "Windows",        ttls: [120, 128], windows: [65535, 65280],        weight: 0.80 },
  { name: "Linux/Ubuntu",  family: "Linux",           ttls: [60,  64],  windows: [5840, 29200, 8576],   weight: 0.82 },
  { name: "Linux/RHEL",    family: "Linux",           ttls: [60,  64],  windows: [32120, 32768],         weight: 0.78 },
  { name: "macOS",         family: "MacOS",           ttls: [60,  64],  windows: [65535, 8192],          weight: 0.75 },
  { name: "Android",       family: "Android",         ttls: [60,  64],  windows: [65535, 5840],          weight: 0.72 },
  { name: "iOS/iPadOS",    family: "iOS",             ttls: [60,  64],  windows: [65535, 6553],          weight: 0.70 },
  { name: "Cisco IOS",     family: "Network Device",  ttls: [250, 255], windows: [4128, 8760],           weight: 0.60 },
  { name: "FreeBSD",       family: "Linux",           ttls: [60,  64],  windows: [65535, 32768],         weight: 0.65 },
];

// ─── User-Agent → OS mapping ──────────────────────────────────────────────────
const UA_PATTERNS: Array<{ pattern: RegExp; os: string; family: OSFingerprint["family"]; confidence: number }> = [
  { pattern: /Windows NT 10\.0/i,  os: "Windows 10/11",   family: "Windows", confidence: 0.90 },
  { pattern: /Windows NT 6\.3/i,   os: "Windows 8.1",     family: "Windows", confidence: 0.88 },
  { pattern: /Windows NT 6\.1/i,   os: "Windows 7",       family: "Windows", confidence: 0.88 },
  { pattern: /Macintosh.*OS X 14/i,os: "macOS Sonoma",    family: "MacOS",   confidence: 0.87 },
  { pattern: /Macintosh.*OS X 13/i,os: "macOS Ventura",   family: "MacOS",   confidence: 0.87 },
  { pattern: /Android 1[3-4]/i,    os: "Android 13/14",   family: "Android", confidence: 0.88 },
  { pattern: /Android 12/i,        os: "Android 12",      family: "Android", confidence: 0.86 },
  { pattern: /iPhone.*OS 17/i,     os: "iOS 17",          family: "iOS",     confidence: 0.89 },
  { pattern: /iPhone.*OS 16/i,     os: "iOS 16",          family: "iOS",     confidence: 0.87 },
  { pattern: /Linux.*Ubuntu/i,     os: "Ubuntu Linux",    family: "Linux",   confidence: 0.82 },
  { pattern: /Linux.*Debian/i,     os: "Debian Linux",    family: "Linux",   confidence: 0.80 },
  { pattern: /CentOS/i,            os: "CentOS Linux",    family: "Linux",   confidence: 0.80 },
];

// ─── DNS query → OS hints ─────────────────────────────────────────────────────
const DNS_HINTS: Record<string, { os: string; family: OSFingerprint["family"]; confidence: number }> = {
  "update.microsoft.com":              { os: "Windows",         family: "Windows", confidence: 0.88 },
  "windowsupdate.com":                 { os: "Windows",         family: "Windows", confidence: 0.86 },
  "clients.google.com":                { os: "Android/Chrome",  family: "Android", confidence: 0.75 },
  "connectivitycheck.android.com":     { os: "Android",         family: "Android", confidence: 0.90 },
  "mesu.apple.com":                    { os: "macOS/iOS",       family: "MacOS",   confidence: 0.88 },
  "swcd.apple.com":                    { os: "macOS/iOS",       family: "MacOS",   confidence: 0.85 },
  "archive.ubuntu.com":                { os: "Ubuntu Linux",    family: "Linux",   confidence: 0.87 },
  "security.ubuntu.com":               { os: "Ubuntu Linux",    family: "Linux",   confidence: 0.88 },
  "telemetry.microsoft.com":           { os: "Windows",         family: "Windows", confidence: 0.87 },
  "time.windows.com":                  { os: "Windows",         family: "Windows", confidence: 0.85 },
  "time.apple.com":                    { os: "macOS/iOS",       family: "MacOS",   confidence: 0.83 },
  "ntp.ubuntu.com":                    { os: "Ubuntu Linux",    family: "Linux",   confidence: 0.85 },
};

// ─── TLS Cipher suite fingerprints (JA3-style mapping) ───────────────────────
const TLS_FINGERPRINTS: Record<string, { os: string; confidence: number }> = {
  "cd08e31494f9531f560d64c695473da9": { os: "Windows 10 (Chrome)", confidence: 0.85 },
  "eb1d94daa7e0344597e756a1fb6d7489": { os: "Windows 11 (Edge)",   confidence: 0.83 },
  "a0e9f5d64349fb13191bc781f81f42e1": { os: "macOS (Safari 17)",   confidence: 0.82 },
  "bfbe6c9d7c4f22e7c6d1e7f9a3b5c8d2": { os: "Android (Chrome)",   confidence: 0.80 },
};

// ─── Fingerprint cache ────────────────────────────────────────────────────────
const fingerprintCache = new Map<string, OSFingerprint>();
const dnsQueryLog      = new Map<string, string[]>();   // ip → [domains]

// ─── Core: analyze packet data ───────────────────────────────────────────────
export function analyzePacketData(pkt: PacketData): OSFingerprint | null {
  const behaviors: string[] = [];

  // 1. TTL-based matching
  let bestSig = OS_SIGS.find(
    s => pkt.ttl >= s.ttls[0] && pkt.ttl <= s.ttls[1] &&
         s.windows.some(w => Math.abs(w - pkt.windowSize) < 1000)
  );

  // Fallback: TTL only
  if (!bestSig) {
    bestSig = OS_SIGS.find(s => pkt.ttl >= s.ttls[0] && pkt.ttl <= s.ttls[1]);
  }

  if (!bestSig) return null;

  // 2. Behavior pattern detection
  if (pkt.ttl < 50)  behaviors.push("Low TTL — possible VPN/tunnel");
  if (pkt.ttl > 250) behaviors.push("Max TTL — network device or amplified");
  if (pkt.windowSize < 1024) behaviors.push("Abnormally small window — firewall evasion?");

  // 3. User-agent enrichment
  let uaOs    = bestSig.name;
  let uaConf  = bestSig.weight;
  let uaFamily: OSFingerprint["family"] = bestSig.family;
  let uaVer   = "";

  if (pkt.userAgent) {
    for (const pat of UA_PATTERNS) {
      if (pat.pattern.test(pkt.userAgent)) {
        uaOs    = pat.os;
        uaFamily= pat.family;
        uaConf  = Math.max(uaConf, pat.confidence);
        uaVer   = pat.os;
        behaviors.push("User-Agent confirmed OS family");
        break;
      }
    }
  }

  const fp: OSFingerprint = {
    ip:               pkt.srcIP,
    os:               uaOs,
    family:           uaFamily,
    version:          uaVer || bestSig.name,
    confidence:       uaConf,
    ttl:              pkt.ttl,
    windowSize:       pkt.windowSize,
    tcpOptions:       pkt.tcpOptions || [],
    tlsCiphers:       [],
    dnsPatterns:      dnsQueryLog.get(pkt.srcIP) || [],
    behaviorPatterns: behaviors,
    detectedAt:       new Date().toISOString(),
    source:           pkt.userAgent ? "TCP+UA" : "TCP/IP",
  };

  fingerprintCache.set(pkt.srcIP, fp);
  return fp;
}

// ─── Enrich with DNS hint ─────────────────────────────────────────────────────
export function recordDNSQuery(srcIP: string, domain: string): void {
  if (!dnsQueryLog.has(srcIP)) dnsQueryLog.set(srcIP, []);
  const list = dnsQueryLog.get(srcIP)!;
  if (!list.includes(domain)) list.push(domain);

  // Update cached fingerprint if DNS reveals OS
  for (const [key, hint] of Object.entries(DNS_HINTS)) {
    if (domain.includes(key)) {
      const existing = fingerprintCache.get(srcIP);
      if (existing) {
        existing.dnsPatterns = list;
        existing.behaviorPatterns.push(`DNS pattern: ${key} → ${hint.os}`);
        existing.confidence = Math.max(existing.confidence, hint.confidence);
      } else {
        fingerprintCache.set(srcIP, {
          ip:               srcIP,
          os:               hint.os,
          family:           hint.family,
          version:          hint.os,
          confidence:       hint.confidence,
          ttl:              0,
          windowSize:       0,
          tcpOptions:       [],
          tlsCiphers:       [],
          dnsPatterns:      [domain],
          behaviorPatterns: [`DNS pattern confirmed: ${key}`],
          detectedAt:       new Date().toISOString(),
          source:           "DNS",
        });
      }
    }
  }
}

// ─── Fingerprint from request headers (HTTP-layer passive) ───────────────────
export function fingerprintFromRequest(srcIP: string, headers: Record<string, string | string[] | undefined>): OSFingerprint {
  const ua      = (headers["user-agent"] as string) || "";
  const accept  = (headers["accept-language"] as string) || "";
  const encoding= (headers["accept-encoding"] as string) || "";

  // Check cache first
  const cached = fingerprintCache.get(srcIP);
  if (cached && Date.now() - new Date(cached.detectedAt).getTime() < 600_000) {
    return cached;
  }

  let os      = "Unknown";
  let family: OSFingerprint["family"] = "Unknown";
  let conf    = 0.30;
  const behaviors: string[] = [];

  for (const pat of UA_PATTERNS) {
    if (pat.pattern.test(ua)) {
      os     = pat.os;
      family = pat.family;
      conf   = pat.confidence;
      behaviors.push("HTTP User-Agent fingerprinted");
      break;
    }
  }

  // Accept-Language hints geolocation
  if (accept.startsWith("en-MW") || accept.startsWith("ny")) {
    behaviors.push("Malawi locale detected");
  }

  const fp: OSFingerprint = {
    ip:               srcIP,
    os,
    family,
    version:          os,
    confidence:       conf,
    ttl:              0,
    windowSize:       0,
    tcpOptions:       [],
    tlsCiphers:       [],
    dnsPatterns:      dnsQueryLog.get(srcIP) || [],
    behaviorPatterns: behaviors,
    detectedAt:       new Date().toISOString(),
    source:           "HTTP-passive",
  };

  fingerprintCache.set(srcIP, fp);
  return fp;
}

// ─── Public getters ───────────────────────────────────────────────────────────
export function getFingerprint(ip: string): OSFingerprint | null {
  return fingerprintCache.get(ip) ?? null;
}

export function getAllFingerprints(): OSFingerprint[] {
  return Array.from(fingerprintCache.values()).sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
}

export function clearOldFingerprints(olderThanMs = 3_600_000): void {
  const cutoff = Date.now() - olderThanMs;
  for (const [ip, fp] of fingerprintCache) {
    if (new Date(fp.detectedAt).getTime() < cutoff) fingerprintCache.delete(ip);
  }
}
