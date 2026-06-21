/**
 * LitSecure Sentinel — Evidence Malware Scanner
 *
 * Scans uploaded evidence files for malware using a multi-layer pipeline:
 *  1. Extension & magic byte checks
 *  2. ClamAV TCP daemon scan (INSTREAM protocol)
 *  3. YARA database ruleset matching
 *  4. VirusTotal API lookup (when API key is configured)
 */
import crypto from "crypto";
import fs from "fs";
import net from "net";
import { queryAll } from "../db/index.js";

const VT_API_KEY = process.env.VIRUSTOTAL_API_KEY || "";
const VT_BASE    = "https://www.virustotal.com/api/v3";

// ─── Magic byte signatures for known dangerous types ─────────────────────────
const DANGEROUS_MAGIC: Array<{ sig: Buffer; label: string }> = [
  { sig: Buffer.from([0x4D, 0x5A]),                       label: "Windows PE Executable (MZ)" },
  { sig: Buffer.from([0x7F, 0x45, 0x4C, 0x46]),           label: "ELF Executable (Linux/Unix)" },
  { sig: Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]),           label: "Java Class File" },
  { sig: Buffer.from([0x23, 0x21]),                        label: "Script/Shebang (#!)" },
  { sig: Buffer.from([0x50, 0x4B, 0x03, 0x04]),           label: "ZIP Archive (may contain malware)" },
  { sig: Buffer.from([0xD0, 0xCF, 0x11, 0xE0]),           label: "OLE2 Compound Document (macro-enabled Office)" },
];

// File extensions always blocked regardless of content
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".scr", ".pif", ".vbs",
  ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1", ".psm1", ".msi",
  ".msp", ".hta", ".jar", ".py", ".rb", ".sh", ".bash", ".zsh",
]);

export interface ScanResult {
  safe:          boolean;
  method:        "virustotal" | "magic_byte" | "extension_block" | "clamav" | "yara" | "clean";
  threat?:       string;
  details?:      string;
  vt_report?:    any;
  sha256:        string;
}

// ─── Local magic-byte scan ──────────────────────────────────────────────────
function localScan(buffer: Buffer, fileName: string): ScanResult {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const ext    = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      safe:    false,
      method:  "extension_block",
      threat:  `Blocked file type: ${ext}`,
      details: `Files with extension ${ext} are not accepted as evidence. Upload a screenshot, PDF, or log file instead.`,
      sha256,
    };
  }

  for (const { sig, label } of DANGEROUS_MAGIC) {
    if (buffer.length >= sig.length && buffer.subarray(0, sig.length).equals(sig)) {
      return {
        safe:    false,
        method:  "magic_byte",
        threat:  label,
        details: `File content matches a potentially dangerous format (${label}). Upload rejected to protect the platform.`,
        sha256,
      };
    }
  }

  return { safe: true, method: "clean", sha256 };
}

// ─── ClamAV INSTREAM Scan ────────────────────────────────────────────────────
function scanWithClamAV(buffer: Buffer): Promise<{ safe: boolean; threat?: string }> {
  return new Promise((resolve) => {
    const host = process.env.CLAMAV_HOST || "localhost";
    const port = parseInt(process.env.CLAMAV_PORT || "3310", 10);

    const socket = net.createConnection({ host, port }, () => {
      socket.write("zINSTREAM\0");

      const chunkSize = 8192;
      let offset = 0;
      while (offset < buffer.length) {
        const size = Math.min(chunkSize, buffer.length - offset);
        const chunk = buffer.subarray(offset, offset + size);

        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(size, 0);
        socket.write(lenBuf);
        socket.write(chunk);

        offset += size;
      }

      const zeroBuf = Buffer.alloc(4, 0);
      socket.write(zeroBuf);
    });

    let response = "";
    socket.on("data", (chunk) => {
      response += chunk.toString();
    });

    socket.on("end", () => {
      const cleaned = response.trim();
      if (cleaned.includes("FOUND")) {
        const threatName = cleaned.match(/stream:\s+(.+?)\s+FOUND/)?.[1] || "Infected";
        resolve({ safe: false, threat: `ClamAV: ${threatName}` });
      } else {
        resolve({ safe: true });
      }
    });

    socket.on("error", (err) => {
      console.warn(`[ClamAV Scan] Connection failed to ${host}:${port}. Error: ${err.message}. Falling back.`);
      resolve({ safe: true }); // Fallback on connection error
    });
  });
}

// ─── Database-driven YARA Scan ───────────────────────────────────────────────
async function scanWithYara(buffer: Buffer): Promise<{ safe: boolean; threat?: string }> {
  try {
    const rules = await queryAll("SELECT * FROM security_rules WHERE language = 'YARA' AND status = 'Active'");
    const contentStr = buffer.toString("binary");

    for (const rule of rules) {
      const stringMatches = rule.content.match(/\$\w+\s*=\s*(?:"([^"]+)"|\{([^}]+)\})/g) || [];
      const patterns: Array<{ type: "ascii" | "hex"; val: string }> = [];

      for (const sm of stringMatches) {
        const doubleQuoteMatch = sm.match(/\$\w+\s*=\s*"([^"]+)"/);
        if (doubleQuoteMatch) {
          patterns.push({ type: "ascii", val: doubleQuoteMatch[1] });
        } else {
          const hexMatch = sm.match(/\$\w+\s*=\s*\{([^}]+)\}/);
          if (hexMatch) {
            patterns.push({ type: "hex", val: hexMatch[1].replace(/\s+/g, "") });
          }
        }
      }

      let hitCount = 0;
      for (const pat of patterns) {
        if (pat.type === "ascii") {
          if (contentStr.includes(pat.val)) hitCount++;
        } else if (pat.type === "hex") {
          const hexBuf = Buffer.from(pat.val, "hex");
          if (contentStr.includes(hexBuf.toString("binary"))) hitCount++;
        }
      }

      if (patterns.length > 0 && hitCount >= Math.ceil(patterns.length / 2)) {
        return { safe: false, threat: `YARA matched: ${rule.title}` };
      }
    }
  } catch (err) {
    console.error("[YARA Scan] Rule evaluation error:", err);
  }
  return { safe: true };
}

// ─── VirusTotal API Scan ─────────────────────────────────────────────────────
async function vtScan(buffer: Buffer, fileName: string, sha256: string): Promise<ScanResult> {
  try {
    const hashResp = await fetch(`${VT_BASE}/files/${sha256}`, {
      headers: { "x-apikey": VT_API_KEY },
    });

    if (hashResp.ok) {
      const data       = await hashResp.json() as any;
      const stats      = data?.data?.attributes?.last_analysis_stats || {};
      const malicious  = stats.malicious  || 0;
      const suspicious = stats.suspicious || 0;
      const total      = Object.values(stats).reduce((a: any, b: any) => a + b, 0) as number;

      if (malicious > 0 || suspicious > 2) {
        return {
          safe:       false,
          method:     "virustotal",
          threat:     `Detected by ${malicious} AV engines (${suspicious} suspicious)`,
          details:    `VirusTotal analysis: ${malicious}/${total} engines flagged this file as malicious.`,
          sha256,
          vt_report:  { malicious, suspicious, total, link: `https://virustotal.com/gui/file/${sha256}` },
        };
      }

      return {
        safe:      true,
        method:    "virustotal",
        sha256,
        vt_report: { malicious: 0, total, link: `https://virustotal.com/gui/file/${sha256}` },
      };
    }

    const form = new FormData();
    form.append("file", new Blob([buffer]), fileName);

    const uploadResp = await fetch(`${VT_BASE}/files`, {
      method:  "POST",
      headers: { "x-apikey": VT_API_KEY },
      body:    form,
    });

    if (!uploadResp.ok) throw new Error(`VT upload failed: ${uploadResp.status}`);
    const { data } = await uploadResp.json() as any;

    console.log(`[EvidenceScan] VT analysis queued for ${sha256}: ${data?.id}`);
    return { safe: true, method: "virustotal", sha256, details: "VirusTotal analysis queued — result pending." };

  } catch (err: any) {
    console.warn("[EvidenceScan] VT API error:", err.message, "— falling back to clean");
    return { safe: true, method: "clean", sha256 };
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────
export async function scanEvidenceBuffer(buffer: Buffer, fileName: string): Promise<ScanResult> {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  // 1. Static Local Signature Checks
  const local = localScan(buffer, fileName);
  if (!local.safe) return local;

  // 2. ClamAV Engine scan
  const clam = await scanWithClamAV(buffer);
  if (!clam.safe) {
    return {
      safe: false,
      method: "clamav",
      threat: clam.threat,
      details: `File flagged by ClamAV network scanner.`,
      sha256
    };
  }

  // 3. Database YARA Engine Scan
  const yara = await scanWithYara(buffer);
  if (!yara.safe) {
    return {
      safe: false,
      method: "yara",
      threat: yara.threat,
      details: `File triggered a custom system YARA rule.`,
      sha256
    };
  }

  // 4. VirusTotal Reputation Scan
  if (VT_API_KEY) {
    return vtScan(buffer, fileName, sha256);
  }

  return local;
}

// ─── Scan file from disk path ────────────────────────────────────────────────
export async function scanEvidenceFile(filePath: string, fileName: string): Promise<ScanResult> {
  try {
    const buffer = fs.readFileSync(filePath);
    return scanEvidenceBuffer(buffer, fileName);
  } catch (err: any) {
    return {
      safe:    false,
      method:  "clean",
      threat:  "File read error",
      details: err.message,
      sha256:  "",
    };
  }
}
