import { EventEmitter } from "events";
import { db, generateId } from "../db/index.js";

export type EventType =
  | "IncidentCreated"
  | "IncidentEscalated"
  | "ThreatDetected"
  | "MalwareUploaded"
  | "VulnerabilityDetected"
  | "AlertTriggered";

export interface ServerEvent {
  id: string;
  eventType: EventType;
  payload: any;
  status: "PENDING" | "PROCESSED" | "FAILED";
  retryCount: number;
  errorLog: string;
  createdAt: string;
  processedAt?: string;
}

class EventBusService extends EventEmitter {
  constructor() {
    super();
    // Register global error handler to prevent node crashing on error emissions
    this.on("error", (err) => {
      console.error("[EventBus Error]", err);
    });
  }

  /**
   * Publish an event to the bus.
   * Saves it to the database replay buffer first, then emits it asynchronously.
   */
  async publish(eventType: EventType, payload: any): Promise<string> {
    const id = generateId("evt");
    const now = new Date().toISOString();
    const payloadStr = JSON.stringify(payload);

    try {
      db.prepare(`
        INSERT INTO server_events (id, event_type, payload, status, retry_count, error_log, created_at)
        VALUES (?, ?, ?, 'PENDING', 0, '', ?)
      `).run(id, eventType, payloadStr, now);
    } catch (err: any) {
      console.error(`[EventBus] Failed to persist event ${eventType}:`, err.message);
    }

    // Emit event in next event loop tick to decouple caller thread
    setImmediate(() => {
      this.emit(eventType, { id, eventType, payload, retryCount: 0 });
    });

    return id;
  }

  /**
   * Replay processed or failed events within an ID range or category to rebuild system state.
   */
  async replay(eventType?: EventType, status?: string): Promise<number> {
    let sql = "SELECT * FROM server_events";
    const params: any[] = [];

    if (eventType || status) {
      sql += " WHERE";
      const clauses: string[] = [];
      if (eventType) {
        clauses.push(" event_type = ?");
        params.push(eventType);
      }
      if (status) {
        clauses.push(" status = ?");
        params.push(status);
      }
      sql += clauses.join(" AND");
    }

    sql += " ORDER BY created_at ASC";

    const rows = db.prepare(sql).all(...params) as any[];

    for (const row of rows) {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(row.payload);
      } catch {}

      setImmediate(() => {
        this.emit(row.event_type, {
          id: row.id,
          eventType: row.event_type as EventType,
          payload: parsedPayload,
          retryCount: row.retry_count,
        });
      });
    }

    return rows.length;
  }

  /**
   * Complete an event successfully. Updates its status in the DB.
   */
  complete(id: string): void {
    try {
      db.prepare(`
        UPDATE server_events
        SET status = 'PROCESSED', processed_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), id);
    } catch (err: any) {
      console.error(`[EventBus] Failed to complete event ${id}:`, err.message);
    }
  }

  /**
   * Fail an event. If retryCount < 3, retries after a short delay.
   * If retryCount >= 3, moves to Dead-Letter Queue (status = 'FAILED').
   */
  fail(id: string, eventType: EventType, payload: any, errorMsg: string, currentRetryCount: number): void {
    const nextRetry = currentRetryCount + 1;
    const isDlq = nextRetry >= 3;

    try {
      db.prepare(`
        UPDATE server_events
        SET status = ?, retry_count = ?, error_log = ?
        WHERE id = ?
      `).run(isDlq ? "FAILED" : "PENDING", nextRetry, errorMsg, id);

      if (isDlq) {
        console.warn(`[EventBus DLQ] Event ${id} (${eventType}) failed after 3 retries: ${errorMsg}`);
        // Log to audit logs table
        db.prepare(`
          INSERT INTO audit_logs (id, timestamp, user_name, user_role, action, details, entity_type, entity_id)
          VALUES (?, ?, 'SYSTEM', 'system', 'EVENT_BUS_FAILURE', ?, 'server_events', ?)
        `).run(
          generateId("aud"),
          new Date().toISOString(),
          `Event ${eventType} failed all retries. Error: ${errorMsg}`,
          id
        );
      } else {
        // Schedule retry with exponential backoff delay (1s, 2s)
        const delay = nextRetry * 1000;
        setTimeout(() => {
          this.emit(eventType, { id, eventType, payload, retryCount: nextRetry });
        }, delay);
      }
    } catch (err: any) {
      console.error(`[EventBus] Failed to fail event ${id}:`, err.message);
    }
  }
}

export const eventBus = new EventBusService();
export default eventBus;
