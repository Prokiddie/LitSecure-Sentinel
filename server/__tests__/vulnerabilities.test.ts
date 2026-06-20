/**
 * Vulnerabilities & CVSS Calculator Unit Tests
 */
import { describe, it, expect } from "vitest";
import { calculateCVSS } from "../routes/vulnerabilities.js";
import { checkRolePermission } from "../middleware/auth.js";

describe("CVSS v3.1 Base Score Calculator", () => {
  it("calculates a critical vulnerability correctly (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)", () => {
    const score = calculateCVSS({
      av: "N",
      ac: "L",
      pr: "N",
      ui: "N",
      s: "U",
      c: "H",
      i: "H",
      a: "H",
    });
    // Expected CVSS score for standard critical is 9.8
    expect(score).toBe(9.8);
  });

  it("calculates scope changed vulnerabilities correctly (AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H)", () => {
    const score = calculateCVSS({
      av: "N",
      ac: "L",
      pr: "H",
      ui: "N",
      s: "C",
      c: "H",
      i: "H",
      a: "H",
    });
    // Expected CVSS score for Scope Changed with High Privs is 9
    expect(score).toBe(9);
  });

  it("calculates a medium vulnerability correctly (AV:L/AC:H/PR:L/UI:R/S:U/C:L/I:L/A:L)", () => {
    const score = calculateCVSS({
      av: "L",
      ac: "H",
      pr: "L",
      ui: "R",
      s: "U",
      c: "L",
      i: "L",
      a: "L",
    });
    expect(score).toBe(4.1);
  });

  it("returns 0 if impact is zero", () => {
    const score = calculateCVSS({
      av: "N",
      ac: "L",
      pr: "N",
      ui: "N",
      s: "U",
      c: "N",
      i: "N",
      a: "N",
    });
    expect(score).toBe(0);
  });
});

describe("RBAC Role Hierarchy & Inheritance", () => {
  it("allows higher roles to inherit access parameters of lower ones", () => {
    // citizen (lowest)
    expect(checkRolePermission("citizen", "citizen")).toBe(true);
    expect(checkRolePermission("org_user", "citizen")).toBe(true);
    expect(checkRolePermission("admin", "citizen")).toBe(true);
    expect(checkRolePermission("super_admin", "citizen")).toBe(true);

    // analyst
    expect(checkRolePermission("analyst", "citizen")).toBe(true);
    expect(checkRolePermission("analyst", "org_user")).toBe(true);
    expect(checkRolePermission("analyst", "analyst")).toBe(true);
    expect(checkRolePermission("citizen", "analyst")).toBe(false);

    // soc_manager
    expect(checkRolePermission("soc_manager", "analyst")).toBe(true);
    expect(checkRolePermission("soc_manager", "org_admin")).toBe(true);
    expect(checkRolePermission("analyst", "soc_manager")).toBe(false);

    // super_admin (highest)
    expect(checkRolePermission("super_admin", "admin")).toBe(true);
    expect(checkRolePermission("super_admin", "soc_manager")).toBe(true);
    expect(checkRolePermission("admin", "super_admin")).toBe(false);
  });
});
