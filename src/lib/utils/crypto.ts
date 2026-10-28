import crypto from "node:crypto";
import fs from "node:fs";

function keyFromEnv(name: string, fallback: string): Buffer {
  const raw = process.env[name];
  if (!raw) {
    return crypto.createHash("sha256").update(`cbr-dev-${fallback}`).digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptionKey(): Buffer {
  return keyFromEnv("APP_ENCRYPTION_KEY", "encryption");
}

function hashKey(): Buffer {
  return keyFromEnv("APP_ID_HASH_KEY", "id-hash");
}

export function encryptText(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptText(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return "";
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const data = Buffer.from(parts[3], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function fingerprint(value: string): string {
  return crypto.createHmac("sha256", hashKey()).update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
