/**
 * Public Reporting and Citizen Tracking Unit Tests
 */
import { describe, it, expect } from "vitest";

// HTML Escaper under test
const escapeHtml = (str: string) => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Sanitize & length logic under test
function sanitizeInput(title: string, desc: string, reporterName: string) {
  if (title.trim().length < 5) throw new Error("INVALID_TITLE");
  if (desc.trim().length < 20) throw new Error("INVALID_DESCRIPTION");
  if (reporterName.trim().length < 2) throw new Error("INVALID_NAME");

  return {
    title: escapeHtml(title.trim().substring(0, 300)),
    description: escapeHtml(desc.trim().substring(0, 5000)),
    reporterName: escapeHtml(reporterName.trim().substring(0, 100)),
  };
}

// Structured message update timeline formatter under test
function formatUpdate(author: string, message: string, status: string) {
  if (!message || !message.trim()) throw new Error("INVALID_MESSAGE");
  return {
    date: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    author: author.trim() || "Citizen (Reporter)",
    message: message.trim(),
    statusBefore: status,
    statusAfter: status
  };
}

describe("Public Report — Input Sanitation & Validation", () => {
  it("escapes potentially dangerous HTML tags in title and description", () => {
    const rawTitle = "<script>alert('xss')</script> Airtel SIM Swap";
    const rawDesc = "A user experienced SIM swap via <iframe src='evil.ru'></iframe>.";
    const rawName = "<b>Austin</b>";

    const clean = sanitizeInput(rawTitle, rawDesc, rawName);
    
    expect(clean.title).not.toContain("<script>");
    expect(clean.title).toContain("&lt;script&gt;");
    expect(clean.description).not.toContain("<iframe");
    expect(clean.description).toContain("&lt;iframe");
    expect(clean.reporterName).toBe("&lt;b&gt;Austin&lt;/b&gt;");
  });

  it("throws error for short titles (< 5 chars)", () => {
    expect(() => sanitizeInput("Swap", "Detailed incident report description goes here to exceed 20 characters.", "Austin")).toThrow("INVALID_TITLE");
  });

  it("throws error for short descriptions (< 20 chars)", () => {
    expect(() => sanitizeInput("SIM Swap Wave", "Short desc", "Austin")).toThrow("INVALID_DESCRIPTION");
  });

  it("throws error for short reporter names (< 2 chars)", () => {
    expect(() => sanitizeInput("SIM Swap Wave", "Detailed incident report description goes here.", "A")).toThrow("INVALID_NAME");
  });
});

describe("Citizen Tracking — Message & Chat Formatting", () => {
  it("formats citizen messages with correct structured author and status fields", () => {
    const update = formatUpdate("Citizen (Reporter)", "Please help, money was stolen.", "Investigating");
    
    expect(update.author).toBe("Citizen (Reporter)");
    expect(update.message).toBe("Please help, money was stolen.");
    expect(update.statusBefore).toBe("Investigating");
    expect(update.statusAfter).toBe("Investigating");
    expect(update.timestamp).toBeDefined();
    expect(update.date).toBeDefined();
  });

  it("falls back to default author if empty name is passed", () => {
    const update = formatUpdate("   ", "New evidence is ready.", "Reported");
    expect(update.author).toBe("Citizen (Reporter)");
  });

  it("throws error on empty message input", () => {
    expect(() => formatUpdate("Citizen", "  ", "Reported")).toThrow("INVALID_MESSAGE");
  });
});
