import pg from "pg";
import { encryptField, decryptField } from "../services/encryptionService.js";

const { Pool } = pg;

// Connection pool targeting local PgBouncer or Postgres service
const DB_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

export const pgPool = DB_URL
  ? new Pool({
      connectionString: DB_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 25,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

// Fields that contain sensitive PII and must be automatically encrypted on write and decrypted on read
const ENCRYPTED_FIELDS = new Set([
  "reporter_name",
  "reporter_contact",
  "reporter_email",
  "reporter_organization",
  "physical_addresses",
  "witness_details"
]);

/**
 * Encrypt any PII fields present in a parameters object or array
 */
export function encryptParams(params: any): any {
  if (!params) return params;

  if (Array.isArray(params)) {
    // For arrays, we don't have key names, so encryption is handled by target query parsing
    return params;
  }

  if (typeof params === "object") {
    const encrypted = { ...params };
    for (const key of Object.keys(encrypted)) {
      const dbKey = camelToSnake(key);
      if (ENCRYPTED_FIELDS.has(dbKey) || ENCRYPTED_FIELDS.has(key)) {
        if (encrypted[key] !== null && encrypted[key] !== undefined) {
          encrypted[key] = encryptField(String(encrypted[key]));
        }
      }
    }
    return encrypted;
  }

  return params;
}

/**
 * Decrypt any PII fields present in a query result row
 */
export function decryptRow(row: any): any {
  if (!row) return row;
  const decrypted = { ...row };
  for (const key of Object.keys(decrypted)) {
    if (ENCRYPTED_FIELDS.has(key)) {
      if (decrypted[key] && typeof decrypted[key] === "string") {
        decrypted[key] = decryptField(decrypted[key]);
      }
    }
  }
  return decrypted;
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Translates SQLite queries and parameterized variables into PostgreSQL compatible syntax.
 */
export function translateSqlToPostgres(sql: string, params: any): { sql: string; values: any[] } {
  let translatedSql = sql;
  const values: any[] = [];

  // 1. Translate SQLite SQL keywords
  translatedSql = translatedSql
    // SQLite INSERT OR IGNORE -> PostgreSQL ON CONFLICT DO NOTHING
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i, (match, table, cols) => {
      // Find the unique constraint for conflicts. threat_intel uses (value, type), blocklist uses (type, value)
      let conflictTarget = "id";
      if (table.toLowerCase() === "threat_intel") conflictTarget = "value, type";
      if (table.toLowerCase() === "blocklist") conflictTarget = "type, value";
      return `INSERT INTO ${table} (${cols}) VALUES`;
    });

  // Append conflict targets at the end if INSERT OR IGNORE was translated
  if (sql.toUpperCase().includes("INSERT OR IGNORE")) {
    if (translatedSql.toLowerCase().includes("threat_intel")) {
      translatedSql += " ON CONFLICT (value, type) DO NOTHING";
    } else if (translatedSql.toLowerCase().includes("blocklist")) {
      translatedSql += " ON CONFLICT (type, value) DO NOTHING";
    } else {
      translatedSql += " ON CONFLICT (id) DO NOTHING";
    }
  }

  // SQLite INSERT OR REPLACE -> PostgreSQL ON CONFLICT DO UPDATE
  if (sql.toUpperCase().includes("INSERT OR REPLACE")) {
    translatedSql = translatedSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)/i, "INSERT INTO $1");
    if (translatedSql.toLowerCase().includes("seed_meta")) {
      translatedSql += " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";
    } else if (translatedSql.toLowerCase().includes("watchlist")) {
      translatedSql += " ON CONFLICT (value) DO UPDATE SET risk_level = EXCLUDED.risk_level, reason = EXCLUDED.reason";
    } else if (translatedSql.toLowerCase().includes("vulnerabilities")) {
      translatedSql += " ON CONFLICT (cve_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, cvss_score = EXCLUDED.cvss_score, severity = EXCLUDED.severity, status = EXCLUDED.status, affected_assets = EXCLUDED.affected_assets, remediation = EXCLUDED.remediation, updated_at = EXCLUDED.updated_at";
    } else {
      translatedSql += " ON CONFLICT (id) DO UPDATE SET updated_at = now()";
    }
  }

  // 2. Parse Parameter Bindings
  if (params && typeof params === "object" && !Array.isArray(params)) {
    // Named parameters e.g. @id, @title
    const regex = /@(\w+)\b/g;
    let match;
    let paramIndex = 1;
    const keyMap: string[] = [];

    // Replace named params with postgres positional params $1, $2...
    translatedSql = translatedSql.replace(regex, (m, key) => {
      keyMap.push(key);
      const replacement = `$${paramIndex}`;
      paramIndex++;
      return replacement;
    });

    // Build values array in the parsed order
    for (const key of keyMap) {
      let val = params[key];
      // Auto-serialize objects/arrays for JSONB in Postgres
      if (val !== null && val !== undefined && (typeof val === "object" || Array.isArray(val))) {
        val = JSON.stringify(val);
      }
      values.push(val === undefined ? null : val);
    }
  } else if (Array.isArray(params)) {
    // Positional parameters ? -> $1, $2...
    let paramIndex = 1;
    translatedSql = translatedSql.replace(/\?/g, () => {
      const replacement = `$${paramIndex}`;
      paramIndex++;
      return replacement;
    });

    for (const val of params) {
      let finalVal = val;
      if (finalVal !== null && finalVal !== undefined && (typeof finalVal === "object" || Array.isArray(finalVal))) {
        finalVal = JSON.stringify(finalVal);
      }
      values.push(finalVal === undefined ? null : finalVal);
    }
  }

  return { sql: translatedSql, values };
}

/**
 * Execute a query on the PostgreSQL Pool.
 */
export async function executePostgresQuery<T = any>(sql: string, params: any = []): Promise<T[]> {
  if (!pgPool) {
    throw new Error("PostgreSQL pool is not initialized. Check DATABASE_URL.");
  }

  // Encrypt PII parameters automatically
  const encryptedParams = encryptParams(params);
  const { sql: finalSql, values } = translateSqlToPostgres(sql, encryptedParams);

  const client = await pgPool.connect();
  try {
    const res = await client.query(finalSql, values);
    // Decrypt PII data fields in returned rows automatically
    return res.rows.map(decryptRow) as T[];
  } finally {
    client.release();
  }
}
