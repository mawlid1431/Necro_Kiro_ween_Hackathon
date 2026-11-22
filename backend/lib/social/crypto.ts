import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Platform tokens are stored sealed with AES-256-GCM. The key (SOCIAL_TOKEN_KEY, 32 bytes, base64)
// lives only in Convex env vars, so a database export alone never reveals a usable token.

function key(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_KEY;
  const k = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (k.length !== 32) throw new Error("SOCIAL_TOKEN_KEY is not set (32 bytes, base64)");
  return k;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), body.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
}

export function unseal(sealed: string): string {
  const [v, iv, body, tag] = sealed.split(".");
  if (v !== "v1" || !iv || !body || !tag) throw new Error("Unknown token format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
