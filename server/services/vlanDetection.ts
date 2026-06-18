/**
 * LitSecure Sentinel — VLAN Hopping & Network Evasion Detection Service
 *
 * Detects three primary VLAN attack classes:
 *  1. Double Tagging (802.1Q / QinQ VLAN hopping — the classic exploit)
 *  2. VLAN ID Scanning (source appearing on ≥3 VLANs in a time window)
 *  3. Switch Spoofing / DTP (MAC appearing on inconsistent VLANs)
 *
 * Also monitors for:
 *  - DHCP option-121 route injection (CVE-2024-3661 TunnelVision)
 *  - Unauthorized access to critical VLANs (Banking, Govt, Telecom, Utility)
 *  - Inter-VLAN traffic anomalies (protocol dominance > 80%)
 *
 * In a real deployment, feed raw PCAP events into analyzeRawVLANPacket().
 * For simulation/testing, use simulateVLANEvent() or the HTTP API.
 */

export type VLANAlertType =
  | "DOUBLE_TAGGING"
  | "VLAN_SCAN"
  | "SWITCH_SPOOF"
  | "VLAN_HOP_ATTEMPT"
  | "DHCP_ROUTE_INJECTION"
  | "UNAUTHORIZED_VLAN_ACCESS"
  | "INTER_VLAN_ANOMALY";

export interface VLANHoppingAlert {
  id:           string;
  type:         VLANAlertType;
  severity:     "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  sourceIP:     string;
  sourceMAC?:   string;
  targetVLAN:   number;
  originalVLAN: number;
  confidence:   number;
  evidence:     string[];
  mitigations:  string[];
  timestamp:    string;
  resolved:     boolean;
}

export interface VLANPacketEvent {
  srcIP:         string;
  dstIP:         string;
  srcMAC:        string;
  dstMAC:        string;
  vlanID:        number;
  protocol:      number;        // IP protocol number (6=TCP, 17=UDP, 1=ICMP)
  isDoubleTagged:boolean;
  outerVLAN?:    number;        // outer tag in double-tagging attack
  payloadBytes:  number;
  dhcpOption121?:boolean;       // DHCP option 121 (classless static route) present
}

// ─── Network topology config ──────────────────────────────────────────────────
const CRITICAL_VLANS = new Set([10, 20, 30, 40]);     // Banking, Govt, Telecom, Utility
const TRUSTED_VLANS  = new Set([1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);

// Map: VLAN → label
const VLAN_LABELS: Record<number, string> = {
  10:  "Banking / Finance",
  20:  "Government",
  30:  "Telecom Infrastructure",
  40:  "Utility / Power",
  50:  "Public Sector",
  60:  "Healthcare",
  70:  "Media / ISP",
  80:  "Education",
  90:  "Law Enforcement",
  100: "Management",
};

// ─── In-memory state ──────────────────────────────────────────────────────────
const macVLANMap    = new Map<string, { vlan: number; firstSeen: Date }>();
const ipVLANMap     = new Map<string, Set<number>>();          // ip → set of VLANs seen on
const vlanTraffic   = new Map<number, { count: number; protocols: number[] }>();
const alerts: VLANHoppingAlert[] = [];

let alertSeq = 1;
function nextId() { return `VLAN-${String(alertSeq++).padStart(5, "0")}`; }

function severity(type: VLANAlertType, targetVLAN: number): VLANHoppingAlert["severity"] {
  if (CRITICAL_VLANS.has(targetVLAN)) {
    if (type === "DOUBLE_TAGGING" || type === "DHCP_ROUTE_INJECTION") return "CRITICAL";
    return "HIGH";
  }
  if (type === "DOUBLE_TAGGING" || type === "SWITCH_SPOOF")  return "HIGH";
  if (type === "VLAN_SCAN" || type === "UNAUTHORIZED_VLAN_ACCESS") return "MEDIUM";
  return "LOW";
}

// ─── MITIGATIONS per alert type ───────────────────────────────────────────────
const MITIGATIONS: Record<VLANAlertType, string[]> = {
  DOUBLE_TAGGING:           [
    "Remove VLAN 1 as the native VLAN on all trunks",
    "Disable unused trunk ports",
    "Use Access Control Lists (ACLs) on trunk interfaces",
    "Enable BPDU Guard on all access ports",
  ],
  VLAN_SCAN:                [
    "Block the source IP at perimeter firewall",
    "Enable private VLAN (PVLAN) to isolate endpoints",
    "Implement 802.1X port authentication",
  ],
  SWITCH_SPOOF:             [
    "Disable DTP (Dynamic Trunking Protocol) on access ports: 'switchport nonegotiate'",
    "Manually configure all access ports as static access mode",
    "Enable port security with MAC address limits",
  ],
  VLAN_HOP_ATTEMPT:         [
    "Quarantine source MAC at switch level",
    "Enable DHCP snooping on all access VLANs",
    "Review ACLs between VLAN boundaries",
  ],
  DHCP_ROUTE_INJECTION:     [
    "Enable DHCP snooping (CVE-2024-3661 mitigation)",
    "Restrict DHCP option 121 to authorised servers only",
    "Use network namespace isolation on VPN endpoints (Linux mitigation)",
    "Apply RFC 3442 enforcement on edge routers",
  ],
  UNAUTHORIZED_VLAN_ACCESS: [
    "Enforce 802.1X authentication before VLAN assignment",
    "Deploy NAC (Network Access Control) solution",
    "Add the source MAC to the deny list",
  ],
  INTER_VLAN_ANOMALY:       [
    "Review inter-VLAN routing ACLs",
    "Enable NetFlow/IPFIX for traffic baseline",
    "Apply micro-segmentation to suspicious VLAN pairs",
  ],
};

// ─── Core: analyse a VLAN packet event ───────────────────────────────────────
export function analyzeVLANPacket(pkt: VLANPacketEvent): VLANHoppingAlert[] {
  const newAlerts: VLANHoppingAlert[] = [];
  const now = new Date();

  // Track MAC → VLAN
  const macEntry = macVLANMap.get(pkt.srcMAC);
  if (macEntry && macEntry.vlan !== pkt.vlanID) {
    // MAC seen on a different VLAN — switch spoof / MAC spoof
    const alert: VLANHoppingAlert = {
      id:           nextId(),
      type:         "SWITCH_SPOOF",
      severity:     severity("SWITCH_SPOOF", pkt.vlanID),
      sourceIP:     pkt.srcIP,
      sourceMAC:    pkt.srcMAC,
      targetVLAN:   pkt.vlanID,
      originalVLAN: macEntry.vlan,
      confidence:   0.85,
      evidence: [
        `MAC ${pkt.srcMAC} was on VLAN ${macEntry.vlan} (${VLAN_LABELS[macEntry.vlan] || "Unknown"})`,
        `Now appearing on VLAN ${pkt.vlanID} (${VLAN_LABELS[pkt.vlanID] || "Unknown"})`,
        `Possible DTP switch spoofing or MAC address spoofing`,
        `First seen on original VLAN: ${macEntry.firstSeen.toISOString()}`,
      ],
      mitigations: MITIGATIONS["SWITCH_SPOOF"],
      timestamp:   now.toISOString(),
      resolved:    false,
    };
    alerts.push(alert);
    newAlerts.push(alert);
  }
  macVLANMap.set(pkt.srcMAC, { vlan: pkt.vlanID, firstSeen: macEntry?.firstSeen || now });

  // Track IP → VLANs
  if (!ipVLANMap.has(pkt.srcIP)) ipVLANMap.set(pkt.srcIP, new Set());
  const ipVlans = ipVLANMap.get(pkt.srcIP)!;
  ipVlans.add(pkt.vlanID);

  // VLAN scanning: IP on ≥ 3 different VLANs
  if (ipVlans.size >= 3) {
    const alreadyAlerted = alerts.some(
      a => a.type === "VLAN_SCAN" && a.sourceIP === pkt.srcIP &&
           Date.now() - new Date(a.timestamp).getTime() < 300_000   // dedup 5 min
    );
    if (!alreadyAlerted) {
      const alert: VLANHoppingAlert = {
        id:           nextId(),
        type:         "VLAN_SCAN",
        severity:     severity("VLAN_SCAN", pkt.vlanID),
        sourceIP:     pkt.srcIP,
        sourceMAC:    pkt.srcMAC,
        targetVLAN:   pkt.vlanID,
        originalVLAN: 0,
        confidence:   Math.min(0.60 + ipVlans.size * 0.07, 0.95),
        evidence: [
          `Source IP ${pkt.srcIP} detected on ${ipVlans.size} VLANs: ${[...ipVlans].join(", ")}`,
          `Active VLAN enumeration / scanning behaviour`,
        ],
        mitigations: MITIGATIONS["VLAN_SCAN"],
        timestamp:   now.toISOString(),
        resolved:    false,
      };
      alerts.push(alert);
      newAlerts.push(alert);
    }
  }

  // Double tagging
  if (pkt.isDoubleTagged && pkt.outerVLAN !== undefined) {
    const alert: VLANHoppingAlert = {
      id:           nextId(),
      type:         "DOUBLE_TAGGING",
      severity:     severity("DOUBLE_TAGGING", pkt.vlanID),
      sourceIP:     pkt.srcIP,
      sourceMAC:    pkt.srcMAC,
      targetVLAN:   pkt.vlanID,
      originalVLAN: pkt.outerVLAN,
      confidence:   CRITICAL_VLANS.has(pkt.vlanID) ? 0.99 : 0.93,
      evidence: [
        `802.1Q double-tagged frame: outer VLAN ${pkt.outerVLAN} → inner VLAN ${pkt.vlanID}`,
        `Source: ${pkt.srcIP} (${pkt.srcMAC})`,
        `Destination: ${pkt.dstIP} (${pkt.dstMAC})`,
        `Target network: ${VLAN_LABELS[pkt.vlanID] || "Unknown"} (VLAN ${pkt.vlanID})`,
        `Protocol: ${pkt.protocol === 6 ? "TCP" : pkt.protocol === 17 ? "UDP" : `IP/${pkt.protocol}`}`,
      ],
      mitigations: MITIGATIONS["DOUBLE_TAGGING"],
      timestamp:   now.toISOString(),
      resolved:    false,
    };
    alerts.push(alert);
    newAlerts.push(alert);
  }

  // Unauthorized access to critical VLAN
  if (CRITICAL_VLANS.has(pkt.vlanID) && !macEntry) {
    // New MAC on a critical VLAN = suspicious
    const alert: VLANHoppingAlert = {
      id:           nextId(),
      type:         "UNAUTHORIZED_VLAN_ACCESS",
      severity:     "HIGH",
      sourceIP:     pkt.srcIP,
      sourceMAC:    pkt.srcMAC,
      targetVLAN:   pkt.vlanID,
      originalVLAN: 0,
      confidence:   0.80,
      evidence: [
        `Unknown device accessing critical VLAN ${pkt.vlanID} (${VLAN_LABELS[pkt.vlanID]})`,
        `MAC ${pkt.srcMAC} has no prior trust record`,
        `Source IP: ${pkt.srcIP}`,
      ],
      mitigations: MITIGATIONS["UNAUTHORIZED_VLAN_ACCESS"],
      timestamp:   now.toISOString(),
      resolved:    false,
    };
    alerts.push(alert);
    newAlerts.push(alert);
  }

  // DHCP option-121 route injection (TunnelVision indicator)
  if (pkt.dhcpOption121) {
    const alert: VLANHoppingAlert = {
      id:           nextId(),
      type:         "DHCP_ROUTE_INJECTION",
      severity:     "CRITICAL",
      sourceIP:     pkt.srcIP,
      sourceMAC:    pkt.srcMAC,
      targetVLAN:   pkt.vlanID,
      originalVLAN: 0,
      confidence:   0.92,
      evidence: [
        `DHCP option 121 (classless static route) detected from ${pkt.srcIP}`,
        `CVE-2024-3661 (TunnelVision) attack pattern: rogue DHCP server injecting route`,
        `Attack can de-anonymise VPN users by redirecting traffic outside the tunnel`,
        `VLAN: ${pkt.vlanID} (${VLAN_LABELS[pkt.vlanID] || "Unknown"})`,
      ],
      mitigations: MITIGATIONS["DHCP_ROUTE_INJECTION"],
      timestamp:   now.toISOString(),
      resolved:    false,
    };
    alerts.push(alert);
    newAlerts.push(alert);
  }

  // Track VLAN traffic volume
  const vt = vlanTraffic.get(pkt.vlanID) || { count: 0, protocols: [] };
  vt.count++;
  vt.protocols.push(pkt.protocol);
  if (vt.protocols.length > 200) vt.protocols.splice(0, 100);  // rolling window
  vlanTraffic.set(pkt.vlanID, vt);

  // Inter-VLAN anomaly: protocol dominance > 80%
  if (vt.count > 20) {
    const dominant = vt.protocols.filter(p => p === pkt.protocol).length / vt.protocols.length;
    if (dominant > 0.80) {
      const alreadyAlerted = alerts.some(
        a => a.type === "INTER_VLAN_ANOMALY" && a.targetVLAN === pkt.vlanID &&
             Date.now() - new Date(a.timestamp).getTime() < 120_000
      );
      if (!alreadyAlerted) {
        const alert: VLANHoppingAlert = {
          id:           nextId(),
          type:         "INTER_VLAN_ANOMALY",
          severity:     "MEDIUM",
          sourceIP:     pkt.srcIP,
          sourceMAC:    pkt.srcMAC,
          targetVLAN:   pkt.vlanID,
          originalVLAN: 0,
          confidence:   0.70,
          evidence: [
            `Protocol ${pkt.protocol === 6 ? "TCP" : pkt.protocol === 17 ? "UDP" : pkt.protocol} `
            + `dominates VLAN ${pkt.vlanID} traffic (${Math.round(dominant * 100)}%)`,
            `Total packets analysed: ${vt.count}`,
            `Possible reconnaissance or covert channel`,
          ],
          mitigations: MITIGATIONS["INTER_VLAN_ANOMALY"],
          timestamp:   now.toISOString(),
          resolved:    false,
        };
        alerts.push(alert);
        newAlerts.push(alert);
      }
    }
  }

  return newAlerts;
}

// ─── Simulate a VLAN event (for demo / API testing) ──────────────────────────
export function simulateVLANEvent(type: VLANAlertType): VLANHoppingAlert[] {
  const simPkts: Record<VLANAlertType, VLANPacketEvent> = {
    DOUBLE_TAGGING: {
      srcIP: "192.168.1.44",  dstIP: "10.20.0.1",
      srcMAC: "AA:BB:CC:11:22:33", dstMAC: "FF:FF:FF:FF:FF:FF",
      vlanID: 20,  protocol: 6,  isDoubleTagged: true, outerVLAN: 1,
      payloadBytes: 1460,
    },
    VLAN_SCAN: {
      srcIP: "192.168.5.99", dstIP: "10.100.0.1",
      srcMAC: "DE:AD:BE:EF:00:01", dstMAC: "FF:FF:FF:FF:FF:FF",
      vlanID: 50, protocol: 17, isDoubleTagged: false, payloadBytes: 64,
    },
    SWITCH_SPOOF: {
      srcIP: "10.0.1.12", dstIP: "10.20.0.5",
      srcMAC: "CA:FE:BA:BE:00:FF", dstMAC: "00:11:22:33:44:55",
      vlanID: 30, protocol: 6, isDoubleTagged: false, payloadBytes: 512,
    },
    VLAN_HOP_ATTEMPT: {
      srcIP: "172.16.0.77", dstIP: "10.10.0.1",
      srcMAC: "11:22:33:44:55:66", dstMAC: "00:AA:BB:CC:DD:EE",
      vlanID: 10, protocol: 6, isDoubleTagged: false, payloadBytes: 200,
    },
    DHCP_ROUTE_INJECTION: {
      srcIP: "192.168.0.50", dstIP: "255.255.255.255",
      srcMAC: "AA:11:BB:22:CC:33", dstMAC: "FF:FF:FF:FF:FF:FF",
      vlanID: 1, protocol: 17, isDoubleTagged: false,
      payloadBytes: 342, dhcpOption121: true,
    },
    UNAUTHORIZED_VLAN_ACCESS: {
      srcIP: "10.99.0.5", dstIP: "10.10.0.254",
      srcMAC: "FE:DC:BA:98:76:54", dstMAC: "00:DE:AD:BE:EF:00",
      vlanID: 10, protocol: 6, isDoubleTagged: false, payloadBytes: 80,
    },
    INTER_VLAN_ANOMALY: {
      srcIP: "10.40.0.22", dstIP: "10.40.0.1",
      srcMAC: "12:34:56:78:9A:BC", dstMAC: "FF:FF:FF:FF:FF:FF",
      vlanID: 40, protocol: 1, isDoubleTagged: false, payloadBytes: 28,
    },
  };

  // Force-add enough packets to trigger anomaly detection for INTER_VLAN_ANOMALY
  if (type === "INTER_VLAN_ANOMALY") {
    for (let i = 0; i < 25; i++) analyzeVLANPacket(simPkts[type]);
  }
  if (type === "VLAN_SCAN") {
    // Add the same IP on 3 different VLANs
    const base = simPkts[type];
    analyzeVLANPacket({ ...base, vlanID: 10 });
    analyzeVLANPacket({ ...base, vlanID: 20 });
    analyzeVLANPacket({ ...base, vlanID: 30 });
  }

  return analyzeVLANPacket(simPkts[type]);
}

// ─── Public getters ───────────────────────────────────────────────────────────
export function getRecentAlerts(minutesBack = 60): VLANHoppingAlert[] {
  const cutoff = Date.now() - minutesBack * 60_000;
  return alerts
    .filter(a => new Date(a.timestamp).getTime() > cutoff)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getAllVLANAlerts(): VLANHoppingAlert[] {
  return [...alerts].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function resolveAlert(id: string): boolean {
  const alert = alerts.find(a => a.id === id);
  if (!alert) return false;
  alert.resolved = true;
  return true;
}

export function isVLANHopping(ip: string, windowMinutes = 5): boolean {
  return getRecentAlerts(windowMinutes).some(a => a.sourceIP === ip && !a.resolved);
}

export function getVLANStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const a of alerts) {
    stats[a.type] = (stats[a.type] || 0) + 1;
  }
  return stats;
}
