/**
 * Profile-picture validation, shared by uploads and IdP fetches.
 *
 * The type is decided by the file's magic bytes and nothing else: not by a
 * data-URL prefix, a `Content-Type` header or a file extension, all of which
 * the sender controls. Only three raster formats pass. SVG is refused on
 * purpose — it is a document that can carry script, and an avatar is served
 * to every console user. The bytes are stored and served exactly as received;
 * nothing here decodes or resizes them (no native image library).
 */

export type AvatarMime = 'image/png' | 'image/jpeg' | 'image/webp'

export const AVATAR_MIME_TYPES: readonly AvatarMime[] = ['image/png', 'image/jpeg', 'image/webp']

/** Largest accepted picture, in bytes (512 KB). */
export const AVATAR_MAX_BYTES = 512 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false
  return sig.every((b, i) => bytes[offset + i] === b)
}

/**
 * The image type these bytes actually are, or null for anything that is not
 * PNG, JPEG or WebP (SVG, GIF, HTML, a truncated file, …).
 */
export function sniffAvatarType(bytes: Uint8Array): AvatarMime | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  // JPEG: SOI marker followed by the start of the next marker.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  // WebP: a RIFF container whose form type is WEBP.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'
  }
  return null
}

export type AvatarCheck =
  | { ok: true; contentType: AvatarMime }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type' }

/** Size cap, then magic bytes. */
export function checkAvatarBytes(bytes: Uint8Array): AvatarCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' }
  if (bytes.length > AVATAR_MAX_BYTES) return { ok: false, reason: 'too_large' }
  const contentType = sniffAvatarType(bytes)
  return contentType ? { ok: true, contentType } : { ok: false, reason: 'unsupported_type' }
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
const DATA_URL = /^data:[^,]*;base64,/i

/** Longest base64 string that can decode to at most `AVATAR_MAX_BYTES`. */
const MAX_BASE64_LENGTH = Math.ceil(AVATAR_MAX_BYTES / 3) * 4

export type DecodedAvatar =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: 'malformed' | 'too_large' }

/**
 * Decode the `data` field of an avatar upload: plain base64, or a
 * `data:<anything>;base64,` URL. Whatever media type a data URL claims is
 * discarded — `checkAvatarBytes` decides the type from the bytes.
 */
export function decodeAvatarData(data: string): DecodedAvatar {
  let body = data.trim()
  if (DATA_URL.test(body)) body = body.slice(body.indexOf(',') + 1)
  body = body.replace(/\s+/g, '')
  if (body.length > MAX_BASE64_LENGTH) return { ok: false, reason: 'too_large' }
  if (body.length === 0 || body.length % 4 !== 0 || !BASE64.test(body)) {
    return { ok: false, reason: 'malformed' }
  }
  return { ok: true, bytes: Buffer.from(body, 'base64') }
}
