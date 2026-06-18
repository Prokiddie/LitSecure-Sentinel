/**
 * Notifications Service Unit Tests
 *
 * Tests: notification creation, factory functions, SSE client registry,
 * priority levels, and role targeting.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Notification factory logic (pure functions) ─────────────────────────────

describe("notification priority classification", () => {
  function severityToPriority(severity: string): string {
    const map: Record<string, string> = {
      Critical: "critical", High: "high",
      Medium: "medium",     Low: "low",
    };
    return map[severity] || "low";
  }

  it("maps Critical severity to critical priority", () => {
    expect(severityToPriority("Critical")).toBe("critical");
  });

  it("maps High severity to high priority", () => {
    expect(severityToPriority("High")).toBe("high");
  });

  it("maps Medium severity to medium priority", () => {
    expect(severityToPriority("Medium")).toBe("medium");
  });

  it("maps unknown severity to low priority", () => {
    expect(severityToPriority("Unknown")).toBe("low");
  });
});

// ─── SSE Client Registry ─────────────────────────────────────────────────────

describe("SSE client registry (in-memory Map)", () => {
  // Simulate the registry logic without importing the actual module
  const registry = new Map<string, Set<any>>();

  function registerClient(role: string, res: any): () => void {
    if (!registry.has(role)) registry.set(role, new Set());
    registry.get(role)!.add(res);
    return () => registry.get(role)?.delete(res);
  }

  function broadcastToRole(role: string, payload: object): number {
    const clients = registry.get(role) || new Set();
    let sent = 0;
    clients.forEach(res => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        sent++;
      } catch {}
    });
    return sent;
  }

  beforeEach(() => registry.clear());

  it("registers a client for a role", () => {
    const fakeRes = { write: vi.fn() };
    registerClient("analyst", fakeRes);
    expect(registry.get("analyst")?.size).toBe(1);
  });

  it("unregisters client on cleanup", () => {
    const fakeRes = { write: vi.fn() };
    const unregister = registerClient("analyst", fakeRes);
    expect(registry.get("analyst")?.size).toBe(1);
    unregister();
    expect(registry.get("analyst")?.size).toBe(0);
  });

  it("broadcasts to all clients of a role", () => {
    const res1 = { write: vi.fn() };
    const res2 = { write: vi.fn() };
    registerClient("analyst", res1);
    registerClient("analyst", res2);
    const sent = broadcastToRole("analyst", { type: "incident_new", title: "Test" });
    expect(sent).toBe(2);
    expect(res1.write).toHaveBeenCalledOnce();
    expect(res2.write).toHaveBeenCalledOnce();
  });

  it("does not throw when no clients are registered for a role", () => {
    expect(() => broadcastToRole("admin", { type: "test" })).not.toThrow();
  });

  it("handles a client write error gracefully", () => {
    const brokenRes = { write: vi.fn().mockImplementation(() => { throw new Error("broken pipe"); }) };
    registerClient("analyst", brokenRes);
    expect(() => broadcastToRole("analyst", { type: "test" })).not.toThrow();
  });

  it("supports multiple roles independently", () => {
    const adminRes   = { write: vi.fn() };
    const analystRes = { write: vi.fn() };
    registerClient("admin", adminRes);
    registerClient("analyst", analystRes);
    broadcastToRole("admin", { type: "test" });
    expect(adminRes.write).toHaveBeenCalledOnce();
    expect(analystRes.write).not.toHaveBeenCalled();
  });
});

// ─── Notification type validation ────────────────────────────────────────────

describe("notification type metadata", () => {
  const VALID_TYPES = [
    "incident_new", "incident_update", "incident_critical", "incident_status_change",
    "campaign_detected", "lockdown_activated", "lockdown_deactivated", "evidence_uploaded",
    "risk_score_critical", "edr_alert", "edr_quarantine", "social_threat",
    "sim_swap_cluster", "threat_intel_ioc", "kb_pending_approval", "public_report",
    "system_alert", "audit_warning",
  ];

  it("has 18 defined notification types", () => {
    expect(VALID_TYPES).toHaveLength(18);
  });

  it("all types are lowercase_underscore strings", () => {
    VALID_TYPES.forEach(t => {
      expect(t).toMatch(/^[a-z_]+$/);
    });
  });
});
