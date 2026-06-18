/**
 * LitSecure Sentinel — Email Alert Service
 * Sends styled HTML emails for critical incidents.
 * Uses Resend API (free tier: 100 emails/day).
 * Falls back to console.log if RESEND_API_KEY is not set.
 */

const getResendKey = () => process.env.RESEND_API_KEY || "";
const getAlertTo   = () => process.env.ALERT_EMAIL_TO   || "macert@macra.mw";
const getAlertFrom = () => process.env.ALERT_EMAIL_FROM || "alerts@litsecure.mw";

export interface IncidentAlertData {
  id:          string;
  title:       string;
  severity:    string;
  category:    string;
  reporterName:string;
  reporterOrg: string;
  description: string;
  mitigation:  string;
}

function buildEmailHtml(inc: IncidentAlertData): string {
  const sevColor = inc.severity === "Critical" ? "#FF4444"
    : inc.severity === "High" ? "#FF8C00"
    : "#FFD600";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#05080F;font-family:monospace;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">

    <!-- Header -->
    <div style="border-bottom:2px solid ${sevColor};padding-bottom:20px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="font-size:24px;">🛡️</span>
        <span style="color:${sevColor};font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;">
          LITSECURE SENTINEL — CRITICAL ALERT
        </span>
      </div>
      <h1 style="color:white;margin:0;font-size:20px;line-height:1.3;">${inc.title}</h1>
    </div>

    <!-- Severity badge -->
    <div style="background:${sevColor}22;border:1px solid ${sevColor}66;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <span style="color:${sevColor};font-weight:bold;font-size:14px;">
        ⚠ SEVERITY: ${inc.severity.toUpperCase()} | CATEGORY: ${inc.category}
      </span>
    </div>

    <!-- Fields -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${[
        ["Incident ID",    inc.id],
        ["Reporter",       inc.reporterName],
        ["Organization",   inc.reporterOrg],
        ["Timestamp",      new Date().toISOString()],
      ].map(([k, v]) => `
      <tr>
        <td style="color:#64748b;font-size:11px;padding:8px 0;border-bottom:1px solid #1e293b;width:35%;">${k}</td>
        <td style="color:#e2e8f0;font-size:12px;padding:8px 0;border-bottom:1px solid #1e293b;">${v}</td>
      </tr>`).join("")}
    </table>

    <!-- Description -->
    <div style="background:#0A0E1A;border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Incident Description</div>
      <p style="color:#cbd5e1;font-size:13px;margin:0;line-height:1.6;">${inc.description.substring(0, 500)}${inc.description.length > 500 ? "..." : ""}</p>
    </div>

    <!-- Mitigation -->
    ${inc.mitigation ? `
    <div style="background:#0A0E1A;border-left:3px solid ${sevColor};border-radius:0 8px 8px 0;padding:16px;margin-bottom:24px;">
      <div style="color:${sevColor};font-size:10px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">AI Mitigation Advice</div>
      <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">${inc.mitigation.substring(0, 400)}</p>
    </div>` : ""}

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="http://localhost:3000" style="display:inline-block;background:${sevColor};color:#05080F;font-weight:bold;font-size:12px;padding:12px 28px;border-radius:6px;text-decoration:none;letter-spacing:1px;">
        OPEN IN SENTINEL DASHBOARD →
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #1e293b;padding-top:16px;text-align:center;">
      <p style="color:#334155;font-size:10px;margin:0;">
        LitSecure Sentinel v1.4 • Malawi Defense Coordinated Node<br/>
        MACRA SEC-80B • MACERT: 112 • This is an automated security alert.
      </p>
    </div>

  </div>
</body>
</html>`;
}

/** Send a critical incident email alert. */
export async function sendCriticalIncidentAlert(inc: IncidentAlertData): Promise<void> {
  const html    = buildEmailHtml(inc);
  const subject = `🚨 [${inc.severity.toUpperCase()}] Cyber Incident: ${inc.title}`;
  const apiKey  = getResendKey();
  const to      = getAlertTo();
  const from    = getAlertFrom();

  if (!apiKey) {
    // No email provider — log to console for development
    console.log(`\n📧 EMAIL ALERT (no RESEND_API_KEY set — logging only)`);
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Incident: ${inc.id} | ${inc.severity} | ${inc.category}\n`);
    return;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    from,
        to:      [to],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`[Email] Resend API error ${resp.status}:`, errBody);
    } else {
      const data = await resp.json();
      console.log(`[Email] ✅ Critical alert sent. ID: ${(data as any).id}`);
    }
  } catch (err) {
    console.error("[Email] Failed to send alert:", err);
  }
}
