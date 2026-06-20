import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { getWarRoomWS } from "../websocket/warroom.js";
import { getRequestCount } from "../middleware/logger.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  try {
    const wsServer = getWarRoomWS();
    const wsCount = wsServer ? wsServer.connectedCount : 0;
    const reqCount = getRequestCount();

    // Fetch incident counts by status and severity
    const incidents = db.prepare(`
      SELECT status, severity, COUNT(*) as c 
      FROM incidents 
      GROUP BY status, severity
    `).all() as any[];

    // Fetch vulnerability counts by status and severity
    const vulnerabilities = db.prepare(`
      SELECT status, severity, COUNT(*) as c 
      FROM vulnerabilities 
      GROUP BY status, severity
    `).all() as any[];

    // Fetch malware blocked counter from audit logs
    const malwareBlocked = (db.prepare(`
      SELECT COUNT(*) as c 
      FROM audit_logs 
      WHERE action = 'EVIDENCE_MALWARE_BLOCKED'
    `).get() as any)?.c ?? 0;

    let output = "";

    // 1. Active Web Clients Gauge
    output += "# HELP litsecure_active_web_clients Count of connected WebSocket SOC analyst sessions\n";
    output += "# TYPE litsecure_active_web_clients gauge\n";
    output += `litsecure_active_web_clients ${wsCount}\n\n`;

    // 2. HTTP Requests Counter
    output += "# HELP litsecure_http_requests_total Total number of HTTP requests processed\n";
    output += "# TYPE litsecure_http_requests_total counter\n";
    output += `litsecure_http_requests_total ${reqCount}\n\n`;

    // 3. Malware Blocked Counter
    output += "# HELP litsecure_malware_blocked_total Total number of uploaded malware files blocked\n";
    output += "# TYPE litsecure_malware_blocked_total counter\n";
    output += `litsecure_malware_blocked_total ${malwareBlocked}\n\n`;

    // 4. Incidents Counter
    output += "# HELP litsecure_incidents_total Total count of incidents by status and severity\n";
    output += "# TYPE litsecure_incidents_total counter\n";
    if (incidents.length === 0) {
      output += 'litsecure_incidents_total{status="none",severity="none"} 0\n';
    } else {
      for (const row of incidents) {
        output += `litsecure_incidents_total{status="${row.status}",severity="${row.severity}"} ${row.c}\n`;
      }
    }
    output += "\n";

    // 5. Vulnerabilities Counter
    output += "# HELP litsecure_vulnerabilities_total Total count of vulnerabilities by status and severity\n";
    output += "# TYPE litsecure_vulnerabilities_total counter\n";
    if (vulnerabilities.length === 0) {
      output += 'litsecure_vulnerabilities_total{status="none",severity="none"} 0\n';
    } else {
      for (const row of vulnerabilities) {
        output += `litsecure_vulnerabilities_total{status="${row.status}",severity="${row.severity}"} ${row.c}\n`;
      }
    }
    output += "\n";

    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(output);
  } catch (err: any) {
    res.status(500).send(`Error generating metrics: ${err.message}`);
  }
});

export default router;
