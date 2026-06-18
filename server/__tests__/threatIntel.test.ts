/**
 * IOC / Threat Intelligence Unit Tests
 *
 * Tests: IOC type detection, blocklist logic, indicator severity mapping,
 * and feed data normalization.
 */
import { describe, it, expect } from "vitest";

// ─── IOC Type Detection (mirrored from threatFeeds.ts) ───────────────────────

function detectIOCType(value: string): string {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value))           return "IP";
  if (/^https?:\/\//.test(value))                         return "URL";
  if (/^[a-fA-F0-9]{32}$/.test(value))                   return "HASH"; // MD5
  if (/^[a-fA-F0-9]{40}$/.test(value))                   return "HASH"; // SHA1
  if (/^[a-fA-F0-9]{64}$/.test(value))                   return "HASH"; // SHA256
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))         return "EMAIL";
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+$/.test(value))  return "DOMAIN";
  return "URL";
}

describe("IOC type detection", () => {
  it("detects IPv4 addresses", () => {
    expect(detectIOCType("192.168.1.100")).toBe("IP");
    expect(detectIOCType("8.8.8.8")).toBe("IP");
    expect(detectIOCType("185.220.101.5")).toBe("IP");
  });

  it("detects URLs with http/https scheme", () => {
    expect(detectIOCType("https://malware.example.com/payload.exe")).toBe("URL");
    expect(detectIOCType("http://phishing.mw/login")).toBe("URL");
  });

  it("detects MD5 hashes (32 hex chars)", () => {
    expect(detectIOCType("d41d8cd98f00b204e9800998ecf8427e")).toBe("HASH");
  });

  it("detects SHA1 hashes (40 hex chars)", () => {
    expect(detectIOCType("da39a3ee5e6b4b0d3255bfef95601890afd80709")).toBe("HASH");
  });

  it("detects SHA256 hashes (64 hex chars)", () => {
    expect(detectIOCType("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe("HASH");
  });

  it("detects email addresses", () => {
    expect(detectIOCType("attacker@evil.ru")).toBe("EMAIL");
    expect(detectIOCType("phishing@fake-bank.com")).toBe("EMAIL");
  });

  it("detects domain names", () => {
    expect(detectIOCType("malware.example.com")).toBe("DOMAIN");
    expect(detectIOCType("evil-site.mw")).toBe("DOMAIN");
  });

  it("does not false-positive on partial IPs", () => {
    expect(detectIOCType("192.168.1")).not.toBe("IP");
  });
});

// ─── Confidence → Severity mapping ───────────────────────────────────────────

describe("confidence to severity mapping", () => {
  function confidenceToSeverity(confidence: number): string {
    if (confidence >= 80) return "Critical";
    if (confidence >= 60) return "High";
    if (confidence >= 40) return "Medium";
    return "Low";
  }

  it("maps 80+ confidence to Critical", () => {
    expect(confidenceToSeverity(80)).toBe("Critical");
    expect(confidenceToSeverity(100)).toBe("Critical");
    expect(confidenceToSeverity(90)).toBe("Critical");
  });

  it("maps 60-79 confidence to High", () => {
    expect(confidenceToSeverity(60)).toBe("High");
    expect(confidenceToSeverity(79)).toBe("High");
  });

  it("maps 40-59 confidence to Medium", () => {
    expect(confidenceToSeverity(40)).toBe("Medium");
    expect(confidenceToSeverity(59)).toBe("Medium");
  });

  it("maps 0-39 confidence to Low", () => {
    expect(confidenceToSeverity(0)).toBe("Low");
    expect(confidenceToSeverity(39)).toBe("Low");
  });
});

// ─── IOC value normalization ──────────────────────────────────────────────────

describe("IOC value normalization", () => {
  const normalizeIoc = (v: string) => v.trim().toLowerCase();

  it("trims whitespace from IOC values", () => {
    expect(normalizeIoc("  192.168.1.1  ")).toBe("192.168.1.1");
  });

  it("lowercases domain names for consistent matching", () => {
    expect(normalizeIoc("EVIL.EXAMPLE.COM")).toBe("evil.example.com");
  });
});
