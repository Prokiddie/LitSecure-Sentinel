/**
 * LitSecure Sentinel — Notifications WebSocket Server
 * Provides secure real-time notification push stream.
 * Replaces SSE with authenticated WebSocket connections.
 */
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server as HTTPServer } from "http";
import { verifyStreamToken } from "../services/tokenService.js";
import { getNotificationsForRole } from "../services/notifications.js";

interface NotificationClient {
  ws: WebSocket;
  userId: string;
  role: string;
  isAlive: boolean;
}

const HEARTBEAT_INTERVAL_MS = 25000;

class NotificationsWSServer {
  private wss: WebSocketServer;
  private clients = new Set<NotificationClient>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: "/ws/notifications" });
    this.init();
    this.startHeartbeat();
  }

  private init(): void {
    this.wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const token = url.searchParams.get("token");

      if (!token) {
        ws.close(1008, "TOKEN_REQUIRED");
        return;
      }

      // Verify the single-use handshake token
      const clientData = verifyStreamToken(token);
      if (!clientData) {
        ws.close(1008, "TOKEN_INVALID_OR_EXPIRED");
        return;
      }

      const client: NotificationClient = {
        ws,
        userId: clientData.id || clientData.userId,
        role: clientData.role,
        isAlive: true,
      };

      this.clients.add(client);
      console.log(`[WS Notifications] Client connected — Role: ${client.role} (Total: ${this.clients.size})`);

      // Send welcome message
      this.send(client, { type: "CONNECTED", role: client.role });

      // Send initial unread notifications
      try {
        const initial = (await getNotificationsForRole(client.role, 10)).filter(n => n.is_read === 0);
        if (initial.length > 0) {
          this.send(client, { type: "INITIAL_NOTIFICATIONS", items: initial });
        }
      } catch (err) {
        console.error("[WS Notifications] Failed to send initial notifications:", err);
      }

      ws.on("pong", () => {
        client.isAlive = true;
      });

      ws.on("close", () => {
        this.clients.delete(client);
        console.log(`[WS Notifications] Client disconnected — Role: ${client.role}`);
      });

      ws.on("error", () => {
        this.clients.delete(client);
      });
    });
  }

  private send(client: NotificationClient, data: object): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  public broadcastToRole(roles: string[], payload: object): void {
    this.clients.forEach(client => {
      if (roles.includes(client.role)) {
        this.send(client, { type: "NOTIFICATION", payload });
      }
    });
  }

  public broadcastAll(payload: object): void {
    this.clients.forEach(client => {
      this.send(client, { type: "NOTIFICATION", payload });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach(client => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
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

let _instance: NotificationsWSServer | null = null;

export function initNotificationsWS(server: HTTPServer): NotificationsWSServer {
  if (!_instance) _instance = new NotificationsWSServer(server);
  return _instance;
}

export function getNotificationsWS(): NotificationsWSServer | null {
  return _instance;
}

export default NotificationsWSServer;
