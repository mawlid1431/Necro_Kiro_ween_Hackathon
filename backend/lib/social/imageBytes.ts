// Images handed to Necro by an AI assistant (MCP write tools): a URL or base64 data. The type is decided from the
// file's own first bytes (magic numbers), never from a header or a file name, so nothing else passes as an image.
// Pure: no Node APIs, so tests and Convex queries can import it.

export const MCP_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB for images sent by an AI assistant (the app's own uploads allow 8 MB)

/** Types an assistant may send: the ones every auto-posting platform accepts (LinkedIn and Instagram refuse WebP). */
export const MCP_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;

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

// ---------- integrity: was the image damaged on the way? ----------
// An assistant in a chat app (claude.ai, ChatGPT) sends a picture by writing out its base64 by hand; one wrong
// character and the file only half-decodes. These checks catch that before the picture can be posted.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Null when the file is whole; otherwise a short reason. PNG: every chunk's CRC must match and the file must end
 * with IEND (any changed byte breaks a CRC). JPEG: it must end with the end-of-image marker (FF D9).
 */
export function imageDamage(bytes: Uint8Array, type: ImageType): string | null {
  if (type === "image/jpeg") {
    let end = bytes.length;
    while (end > 2 && bytes[end - 1] === 0x00) end--; // some encoders pad with zeros
    return bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9 ? null : "the JPEG is cut short (no end-of-image marker)";
  }
  let p = 8;
  let sawIend = false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (p + 12 <= bytes.length) {
    const len = view.getUint32(p);
    if (p + 12 + len > bytes.length) return "the PNG is cut short";
    const crc = view.getUint32(p + 8 + len);
    if (crc32(bytes, p + 4, p + 8 + len) !== crc) return "part of the PNG's data was changed on the way (checksum mismatch)";
    const name = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    p += 12 + len;
    if (name === "IEND") {
      sawIend = true;
      break;
    }
  }
  return sawIend ? null : "the PNG is cut short (no IEND chunk)";
}
