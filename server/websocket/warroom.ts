/**
 * LitSecure Sentinel — War Room WebSocket Server
 * Provides real-time push to all connected SOC clients:
 *   - New incident notifications
 *   - Threat feed updates
 *   - Secure chat relay
 *
 * Path: /ws/warroom
 * Auth: JWT token via ?token=... query param
 */

import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server as HTTPServer } from "http";
import { verifyAccessToken } from "../services/tokenService.js";
import db from "../db/index.js";

// ─── Create warroom_messages table if not already present ─────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS warroom_messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    channel   TEXT    NOT NULL DEFAULT 'global',
    sender    TEXT    NOT NULL,
    org       TEXT    NOT NULL DEFAULT 'SOC',
    user_id   TEXT    NOT NULL DEFAULT 'anon',
    role      TEXT    NOT NULL DEFAULT 'analyst',
    text      TEXT    NOT NULL,
    sent_at   TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_warroom_channel ON warroom_messages(channel);
  CREATE INDEX IF NOT EXISTS idx_warroom_sent_at ON warroom_messages(sent_at);
`);

interface SentinelClient {
  ws: WebSocket;
  userId: string;
  role: string;
  isAlive: boolean;
  channels: Set<string>;
}

const HEARTBEAT_INTERVAL_MS = 25_000;

class WarRoomWSServer {
  private wss: WebSocketServer;
  private clients = new Map<string, SentinelClient>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: "/ws/warroom" });
    this.init();
    this.startHeartbeat();
  }

  private init(): void {
    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      // ─── JWT auth via ?token=... ─────────────────────────────────────────
      const url   = new URL(req.url ?? "/", "http://localhost");
      const token = url.searchParams.get("token");
      if (!token) { ws.close(1008, "AUTH_REQUIRED"); return; }

      let payload: { userId: string; id: string; role: string; name: string } | null = null;
      try {
        payload = verifyAccessToken(token) as any;
      } catch {
        ws.close(1008, "TOKEN_INVALID");
        return;
      }

      const userId = payload!.id ?? payload!.userId ?? "anon";
      const client: SentinelClient = {
        ws,
        userId,
        role: payload!.role,
        isAlive: true,
        channels: new Set(["global"]),
      };
      this.clients.set(userId, client);

      // Send welcome + initial status
      this.send(client, {
        type: "CONNECTED",
        payload: { userId, role: client.role, clientCount: this.clients.size },
      });

      ws.on("pong", () => { client.isAlive = true; });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(client, msg);
        } catch {
          // ignore malformed frames
        }
      });

      ws.on("close", () => {
        this.clients.delete(userId);
      });

      ws.on("error", () => {
        this.clients.delete(userId);
      });
    });

    this.wss.on("error", (err) => {
      console.error("[WS] Server error:", err.message);
    });
  }

  private handleMessage(client: SentinelClient, msg: any): void {
    switch (msg.type) {
      case "SUBSCRIBE":
        if (msg.channel) client.channels.add(msg.channel);
        break;
      case "UNSUBSCRIBE":
        client.channels.delete(msg.channel);
        break;
      case "CHAT": {
        const text    = (msg.text || "").trim();
        const sender  = msg.sender  || client.role;
        const org     = msg.org     || "SOC";
        const channel = msg.channel || "global";
        const sentAt  = new Date().toISOString();
        const time    = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        if (!text) break;

        // ── Persist to SQLite ──────────────────────────────────────────────────
        try {
          db.prepare(
            "INSERT INTO warroom_messages (channel, sender, org, user_id, role, text, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).run(channel, sender, org, client.userId, client.role, text, sentAt);
        } catch (err) {
          console.error("[WS] chat persist error:", err);
        }

        // ── Broadcast to channel (include sender so they see their own msg) ─────
        this.broadcastToChannel(channel, {
          type: "CHAT_MSG",
          payload: { sender, org, text, time, sentAt },
        });
        // Also echo back to sender
        this.send(client, {
          type: "CHAT_MSG",
          payload: { sender, org, text, time, sentAt, self: true },
        });
        break;
      }
      case "PING":
        this.send(client, { type: "PONG", ts: Date.now() });
        break;
    }
  }

  private send(client: SentinelClient, data: object): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  private broadcastToChannel(channel: string, data: object, excludeUserId?: string): void {
    this.clients.forEach((client) => {
      if (client.userId !== excludeUserId && client.channels.has(channel)) {
        this.send(client, data);
      }
    });
  }

  /** Return last N chat messages for a channel (for loading history on connect). */
  public getChatHistory(channel = "global", limit = 100): any[] {
    try {
      return db.prepare(
        "SELECT * FROM warroom_messages WHERE channel = ? ORDER BY sent_at DESC LIMIT ?"
      ).all(channel, limit).reverse();
    } catch { return []; }
  }

  /** Called by incidents route after a new incident is saved. */
  public broadcastNewIncident(incident: {
    id: string;
    title: string;
    severity: string;
    category: string;
    priorityScore?: number;
    priorityLevel?: string;
    priorityFactors?: string[];
  }): void {
    this.broadcastToChannel("global", {
      type: "NEW_INCIDENT",
      payload: { incident, ts: new Date().toISOString() },
    });
  }

  /** Called by threat intel routes when enrichment finishes. */
  public broadcastThreatUpdate(threat: {
    indicator: string;
    abuseScore?: number;
    vtPositives?: number;
    vtTotal?: number;
    geoCountry?: string;
  }): void {
    this.broadcastToChannel("global", {
      type: "THREAT_UPDATE",
      payload: { threat, ts: new Date().toISOString() },
    });
  }

  /** System-wide broadcast (e.g. periodic stats update). */
  public broadcastSystemUpdate(payload: object): void {
    this.broadcastToChannel("global", { type: "SYSTEM_UPDATE", payload });
  }

  public get connectedCount(): number {
    return this.clients.size;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((client, userId) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(userId);
          return;
        }
        client.isAlive = false;
        client.ws.ping();
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  public shutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.clients.forEach(c => c.ws.terminate());
    this.wss.close();
  }
}

// Singleton — created once by server.ts, imported by route handlers
let _instance: WarRoomWSServer | null = null;

export function initWarRoomWS(server: HTTPServer): WarRoomWSServer {
  if (!_instance) _instance = new WarRoomWSServer(server);
  return _instance;
}

export function getWarRoomWS(): WarRoomWSServer | null {
  return _instance;
}

export default WarRoomWSServer;
