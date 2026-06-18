/**
 * LitSecure Sentinel — Evidence Malware Scanner
 *
 * Scans uploaded evidence files for malware using the VirusTotal API v3.
 * Falls back to a local magic-byte check if no API key is configured.
 *
 * Integrated into evidence upload: files are scanned BEFORE being committed to
 * the database. Malicious or suspicious files are quarantined (not stored) and
 * the upload is rejected with a detailed report.
 */
import crypto from "crypto";
import fs from "fs";

const VT_API_KEY = process.env.VIRUSTOTAL_API_KEY || "";
const VT_BASE    = "https://www.virustotal.com/api/v3";

// ─── Magic byte signatures for known dangerous types ─────────────────────────
// Blocks common malware delivery formats regardless of file extension
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
  method:        "virustotal" | "magic_byte" | "extension_block" | "clean";
  threat?:       string;
  details?:      string;
  vt_report?:    any;
  sha256:        string;
}

// ─── Local magic-byte scan (always runs, free) ────────────────────────────────
function localScan(buffer: Buffer, fileName: string): ScanResult {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const ext    = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

  // Extension block
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      safe:    false,
      method:  "extension_block",
      threat:  `Blocked file type: ${ext}`,
      details: `Files with extension ${ext} are not accepted as evidence. Upload a screenshot, PDF, or log file instead.`,
      sha256,
    };
  }

  // Magic byte check
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

// ─── VirusTotal scan (runs when API key is configured) ────────────────────────
async function vtScan(buffer: Buffer, fileName: string, sha256: string): Promise<ScanResult> {
  try {
    // 1. Check if VT already has a report for this hash (free, instant)
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

    // 2. Hash not in VT — upload file for analysis (uses quota)
    const form = new FormData();
    form.append("file", new Blob([buffer]), fileName);

    const uploadResp = await fetch(`${VT_BASE}/files`, {
      method:  "POST",
      headers: { "x-apikey": VT_API_KEY },
      body:    form,
    });

    if (!uploadResp.ok) throw new Error(`VT upload failed: ${uploadResp.status}`);
    const { data } = await uploadResp.json() as any;

    // Return pending — VT analysis takes 30–60s; log it for async follow-up
    console.log(`[EvidenceScan] VT analysis queued for ${sha256}: ${data?.id}`);
    return { safe: true, method: "virustotal", sha256, details: "VirusTotal analysis queued — result pending." };

  } catch (err: any) {
    console.warn("[EvidenceScan] VT API error:", err.message, "— falling back to local scan");
    return localScan(buffer, fileName);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function scanEvidenceBuffer(buffer: Buffer, fileName: string): Promise<ScanResult> {
  // Always run local scan first (instant, no API quota)
  const local = localScan(buffer, fileName);
  if (!local.safe) return local; // Blocked locally — no need to call VT

  // If VT API key is configured, also scan with VT
  if (VT_API_KEY) {
    return vtScan(buffer, fileName, local.sha256);
  }

  return local;
}

// ─── Scan file from disk path ─────────────────────────────────────────────────
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
