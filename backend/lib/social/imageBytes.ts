// Images handed to Necro by an AI assistant (MCP write tools): a URL or base64 data. The type is decided from the
// file's own first bytes (magic numbers), never from a header or a file name, so nothing else passes as an image.
// Pure: no Node APIs, so tests and Convex queries can import it.

export const MCP_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // the same 8 MB cap as uploads in the app

export type ImageType = "image/png" | "image/jpeg";

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Base64 (optionally a data: URL) to bytes. Returns null for anything that is not clean base64. */
export function decodeBase64Image(input: string): Uint8Array | null {
  const raw = input.trim().replace(/^data:image\/(png|jpeg|jpg);base64,/i, "").replace(/\s+/g, "");
  if (!raw || raw.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  // ~4 chars per 3 bytes: refuse oversized input before decoding it.
  if ((raw.length * 3) / 4 > MCP_IMAGE_MAX_BYTES + 3) return null;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
