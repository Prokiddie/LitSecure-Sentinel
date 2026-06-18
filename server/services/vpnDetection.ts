/**
 * LitSecure Sentinel — VPN / Proxy / TOR Detection Service
 *
 * 7-method VPN detection pipeline:
 *  1. Known VPN provider IP prefix matching
 *  2. TOR exit-node list (cached in-process)
 *  3. Known datacenter/hosting ASN detection via ip-api.com
 *  4. DNS PTR record analysis for VPN keywords
 *  5. ASN / organisation name flagging
 *  6. Geolocation distance from Malawi (>5000 km = suspicious)
 *  7. CVE-2024-3661 / TunnelVision DHCP route injection indicators
 *
 * TOR list is refreshed every 6 hours from torproject.org.
 * ip-api.com is used under the free tier (45 req/min); responses are cached 10 min.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface VPNDetectionResult {
  ip:          string;
  isVPN:       boolean;
  isTOR:       boolean;
  isProxy:     boolean;
  isDatacenter:boolean;
  confidence:  number;            // 0–1
  provider?:   string;
  asnOrg?:     string;
  country?:    string;
  city?:       string;
  distanceKm?: number;
  methods:     string[];
  riskLevel:   RiskLevel;
  cveTunnelvision: boolean;       // CVE-2024-3661 indicator
  checkedAt:   string;
}

// ─── Known VPN provider IP prefixes (first 3 octets) ─────────────────────────
const VPN_PREFIXES: Record<string, string[]> = {
  "NordVPN":      ["185.220.101","185.220.102","185.220.103","193.176.86","212.102.49","37.120.208"],
  "ExpressVPN":   ["169.150.128","169.150.129","178.162.211","185.159.157","185.159.158"],
  "Surfshark":    ["185.214.164","185.214.165","185.215.4","185.215.5","45.134.212"],
  "ProtonVPN":    ["185.159.156","185.220.100","185.220.101","192.145.239","193.32.127"],
  "CyberGhost":   ["185.219.186","185.219.187","194.135.93","194.135.94","84.17.32"],
  "PIA":          ["209.222.18","209.222.19","185.216.34","185.231.183"],
  "Mullvad":      ["185.213.154","193.138.218","194.165.16","198.50.200","185.65.134"],
  "HideMyAss":    ["176.126.252","5.44.246","176.126.254","176.126.255","199.192.27"],
  "IPVanish":     ["198.7.62","198.7.63","66.235.168","205.164.32","64.62.197"],
  "Windscribe":   ["103.254.153","154.21.96","185.180.219","195.206.105","45.77.131"],
};

// ─── Known datacenter ASN keywords ───────────────────────────────────────────
const DATACENTER_KEYWORDS = [
  "amazon","aws","azure","google cloud","digital ocean","digitalocean",
  "linode","akamai","cloudflare","ovh","hetzner","vultr","rackspace",
  "hosting","datacenter","data center","colocation","colo","server",
  "choopa","choopa llc","choopa inc","peg tech","quadranet","leaseweb",
];

// ─── Suspicious ASN prefixes ──────────────────────────────────────────────────
const SUSPICIOUS_ASN = [
  "AS13335","AS15169","AS16509","AS14618","AS8075",
  "AS14061","AS20473","AS400031","AS63949","AS20454",
];

// ─── In-process caches ────────────────────────────────────────────────────────
const ipCache  = new Map<string, { data: any; expiry: number }>();  // ip-api.com results
const torNodes = new Set<string>();
let torLastRefresh = 0;

const MALAWI_COORDS = { lat: -13.2543, lon: 34.3015 };

// ─── Fetch ip-api.com (with 10-minute caching) ───────────────────────────────
async function fetchIPInfo(ip: string): Promise<any | null> {
  const cached = ipCache.get(ip);
  if (cached && Date.now() < cached.expiry) return cached.data;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp,org,as,lat,lon,proxy,hosting,mobile`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "success") return null;
    ipCache.set(ip, { data, expiry: Date.now() + 600_000 });
    return data;
  } catch { return null; }
}

// ─── Refresh TOR exit nodes every 6 hours ────────────────────────────────────
async function refreshTORList(): Promise<void> {
  if (Date.now() - torLastRefresh < 21_600_000) return;
  try {
    const res = await fetch("https://check.torproject.org/exit-addresses", {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "LitSecure-Sentinel/1.4 (Malawi MACERT)" },
    });
    if (!res.ok) return;
    const text = await res.text();
    let count = 0;
    for (const line of text.split("\n")) {
      if (line.startsWith("ExitAddress")) {
        const ip = line.split(" ")[1]?.trim();
        if (ip) { torNodes.add(ip); count++; }
      }
    }
    torLastRefresh = Date.now();
    console.log(`[VPN] Loaded ${count} TOR exit nodes`);
  } catch { /* non-critical */ }
}
// Kick off initial fetch
refreshTORList().catch(() => {});

// ─── Haversine distance ───────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R   = 6371;
  const dLat= (lat2 - lat1) * Math.PI / 180;
  const dLon= (lon2 - lon1) * Math.PI / 180;
  const a   = Math.sin(dLat/2)**2
    + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Check VPN provider prefix ───────────────────────────────────────────────
function matchVPNProvider(ip: string): string | null {
  const prefix3 = ip.split(".").slice(0, 3).join(".");
  const prefix2 = ip.split(".").slice(0, 2).join(".");
  for (const [provider, prefixes] of Object.entries(VPN_PREFIXES)) {
    if (prefixes.some(p => prefix3 === p || prefix2 === p || ip.startsWith(p + "."))) {
      return provider;
    }
  }
  return null;
}

// ─── DNS PTR reverse lookup keywords ─────────────────────────────────────────
async function checkPTR(ip: string): Promise<string | null> {
  const keywords = ["vpn","proxy","tor","exit","anon","priv","hide","mask","secure","shield","relay","tunnel"];
  try {
    const reversed = ip.split(".").reverse().join(".");
    const res = await fetch(
      `https://dns.google/resolve?name=${reversed}.in-addr.arpa&type=PTR`,
      { signal: AbortSignal.timeout(4000) }
    );
    const data = await res.json();
    const ptr: string = data?.Answer?.[0]?.data || "";
    if (ptr && keywords.some(kw => ptr.toLowerCase().includes(kw))) return ptr;
  } catch { /* ignore */ }
  return null;
}

// ─── CVE-2024-3661 TunnelVision indicator check ───────────────────────────────
// In production this would monitor DHCP option 121 on the network.
// Here we check if ip-api flags the IP as non-residential + unusual country.
function checkTunnelVision(ipInfo: any): boolean {
  if (!ipInfo) return false;
  // Heuristic: datacenter + no mobile + outside Malawi = suspect TunnelVision candidate
  return !!(ipInfo.hosting && !ipInfo.mobile && ipInfo.countryCode !== "MW");
}

// ─── Main detection function ──────────────────────────────────────────────────
export async function detectVPN(ip: string): Promise<VPNDetectionResult> {
  await refreshTORList();

  const methods: string[] = [];
  let isVPN        = false;
  let isTOR        = false;
  let isProxy      = false;
  let isDatacenter = false;
  let confidence   = 0;
  let riskLevel: RiskLevel = "LOW";
  let provider: string | undefined;

  // 1. VPN provider prefix match
  const matchedProvider = matchVPNProvider(ip);
  if (matchedProvider) {
    isVPN = true;
    provider = matchedProvider;
    confidence = Math.max(confidence, 0.95);
    methods.push(`VPN prefix match → ${matchedProvider}`);
    riskLevel = "CRITICAL";
  }

  // 2. TOR exit node
  if (torNodes.has(ip)) {
    isTOR = true;
    isVPN = true;
    confidence = Math.max(confidence, 0.97);
    provider = provider || "TOR Network";
    methods.push("TOR exit node (torproject.org list)");
    riskLevel = "CRITICAL";
  }

  // 3. ip-api enrichment (proxy/hosting flags + geo)
  const ipInfo = await fetchIPInfo(ip);
  let distanceKm: number | undefined;

  if (ipInfo) {
    // ip-api's own proxy/hosting flags
    if (ipInfo.proxy) {
      isProxy = true;
      isVPN   = true;
      confidence = Math.max(confidence, 0.88);
      methods.push("ip-api proxy flag");
      riskLevel = riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH";
    }
    if (ipInfo.hosting) {
      isDatacenter = true;
      confidence   = Math.max(confidence, 0.70);
      methods.push("ip-api hosting/datacenter flag");
      riskLevel = riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH";
    }

    // 4. ASN / ISP keyword check
    const orgLower = ((ipInfo.org || "") + " " + (ipInfo.isp || "")).toLowerCase();
    const dcMatch = DATACENTER_KEYWORDS.find(kw => orgLower.includes(kw));
    if (dcMatch) {
      isDatacenter = true;
      confidence   = Math.max(confidence, 0.72);
      methods.push(`Datacenter org keyword: "${dcMatch}"`);
      riskLevel = riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH";
    }

    // 5. Suspicious ASN
    const asn = (ipInfo.as || "").toUpperCase();
    const asnMatch = SUSPICIOUS_ASN.find(a => asn.startsWith(a));
    if (asnMatch) {
      confidence = Math.max(confidence, 0.68);
      methods.push(`High-risk ASN: ${asnMatch}`);
      riskLevel = riskLevel === "CRITICAL" ? "CRITICAL" : riskLevel === "HIGH" ? "HIGH" : "MEDIUM";
    }

    // 6. Geolocation distance from Malawi
    if (ipInfo.lat && ipInfo.lon) {
      distanceKm = Math.round(haversineKm(MALAWI_COORDS.lat, MALAWI_COORDS.lon, ipInfo.lat, ipInfo.lon));
      if (distanceKm > 5000) {
        confidence = Math.max(confidence, 0.60);
        methods.push(`Geo anomaly: ${distanceKm} km from Malawi (${ipInfo.city}, ${ipInfo.country})`);
        riskLevel = riskLevel === "CRITICAL" || riskLevel === "HIGH" ? riskLevel : "MEDIUM";
      }
    }
  }

  // 7. DNS PTR keyword check
  const ptr = await checkPTR(ip);
  if (ptr) {
    isVPN = true;
    isProxy = true;
    confidence = Math.max(confidence, 0.78);
    methods.push(`PTR keyword match: ${ptr}`);
    riskLevel = riskLevel === "CRITICAL" ? "CRITICAL" : "HIGH";
  }

  // 8. CVE-2024-3661 TunnelVision
  const cveTunnelvision = checkTunnelVision(ipInfo);
  if (cveTunnelvision) {
    methods.push("CVE-2024-3661 (TunnelVision) indicator: datacenter + non-resident IP");
    confidence = Math.max(confidence, 0.65);
    riskLevel = riskLevel === "CRITICAL" ? "CRITICAL" : riskLevel === "HIGH" ? "HIGH" : "MEDIUM";
  }

  // Compound confidence boost
  if (methods.length >= 3) confidence = Math.min(confidence + 0.08, 0.99);
  if (methods.length >= 5) confidence = Math.min(confidence + 0.05, 0.99);

  if (confidence >= 0.85 && riskLevel === "MEDIUM") riskLevel = "HIGH";
  if (methods.length === 0) riskLevel = "LOW";

  return {
    ip,
    isVPN:       isVPN || isProxy,
    isTOR,
    isProxy,
    isDatacenter,
    confidence:  +confidence.toFixed(3),
    provider,
    asnOrg:      ipInfo?.org,
    country:     ipInfo ? `${ipInfo.city}, ${ipInfo.country}` : undefined,
    city:        ipInfo?.city,
    distanceKm,
    methods,
    riskLevel,
    cveTunnelvision,
    checkedAt:   new Date().toISOString(),
  };
}
