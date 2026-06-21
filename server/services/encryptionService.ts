import crypto from "crypto";

// Derive a 32-byte Master KEK from process.env.LITSECURE_KMS_KEY or fallback to process.env.JWT_SECRET
const MASTER_KEY_SOURCE = process.env.LITSECURE_KMS_KEY || process.env.JWT_SECRET || "dev-fallback-secret-kms-key-DO-NOT-USE-IN-PRODUCTION";
const KEY_VERSION = "v1";

let KEK: Buffer;
try {
  // If the source is a 64-character hex string (32 bytes), parse it directly
  if (/^[0-9a-fA-F]{64}$/.test(MASTER_KEY_SOURCE)) {
    KEK = Buffer.from(MASTER_KEY_SOURCE, "hex");
  } else {
    // Otherwise, derive a cryptographically secure 32-byte key using HKDF
    KEK = Buffer.from(crypto.hkdfSync(
      "sha256",
      MASTER_KEY_SOURCE,
      Buffer.alloc(0), // salt
      Buffer.from("litsecure-sentinel-kms-kek-v1"), // info
      32
    ));
  }
} catch (err) {
  console.error("Failed to initialize Master Key Encryption Key (KEK):", err);
  // Emergency fallback
  KEK = crypto.createHash("sha256").update(MASTER_KEY_SOURCE).digest();
}

interface EncryptedPayload {
  iv: string;
  tag: string;
  encryptedData: string;
  encryptedDek: string;
  version: string;
}

/**
 * Encrypt a field value using AES-256-GCM envelope encryption.
 */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const strValue = String(plaintext);
  if (!strValue) return strValue;

  try {
    // 1. Generate unique 32-byte DEK (Data Encryption Key) and 12-byte IV
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // 2. Encrypt plaintext with DEK using AES-256-GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    let encrypted = cipher.update(strValue, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    // 3. Encrypt the DEK with Master KEK (using AES-256-CBC, which requires IV)
    const dekIv = crypto.randomBytes(16);
    const keyCipher = crypto.createCipheriv("aes-256-cbc", KEK, dekIv);
    let encryptedDek = keyCipher.update(dek, null, "hex");
    encryptedDek += keyCipher.final("hex");

    const payload: EncryptedPayload = {
      iv: iv.toString("hex"),
      tag,
      encryptedData: encrypted,
      // Concatenate the DEK IV and the encrypted DEK to store them together
      encryptedDek: dekIv.toString("hex") + ":" + encryptedDek,
      version: KEY_VERSION,
    };

    return `__ENC__:${JSON.stringify(payload)}`;
  } catch (err) {
    console.error("[Encryption Error] Failed to encrypt field:", err);
    throw new Error("Field encryption failed");
  }
}

/**
 * Decrypt a field value that was encrypted using envelope encryption.
 * Returns the original plaintext, or the input itself if it is not encrypted.
 */
export function decryptField(encryptedValue: string | null | undefined): string | null {
  if (encryptedValue === null || encryptedValue === undefined) return null;
  if (typeof encryptedValue !== "string" || !encryptedValue.startsWith("__ENC__:")) {
    return encryptedValue;
  }

  try {
    const rawJson = encryptedValue.slice(8); // Strip "__ENC__:" prefix
    const payload: EncryptedPayload = JSON.parse(rawJson);

    const iv = Buffer.from(payload.iv, "hex");
    const tag = Buffer.from(payload.tag, "hex");
    const encryptedData = Buffer.from(payload.encryptedData, "hex");

    // Split the DEK IV and the encrypted DEK ciphertext
    const [dekIvHex, encryptedDekHex] = payload.encryptedDek.split(":");
    const dekIv = Buffer.from(dekIvHex, "hex");
    const encryptedDek = Buffer.from(encryptedDekHex, "hex");

    // 1. Decrypt the DEK using the KEK
    const keyDecipher = crypto.createDecipheriv("aes-256-cbc", KEK, dekIv);
    const dekPart1 = keyDecipher.update(encryptedDek);
    const dekPart2 = keyDecipher.final();
    const dek = Buffer.concat([dekPart1, dekPart2]);

    // 2. Decrypt ciphertext with the DEK
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedData).toString("utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("[Decryption Error] Failed to decrypt field:", err);
    return "[DECRYPTION_ERROR]";
  }
}
