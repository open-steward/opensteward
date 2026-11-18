const ALPHABET = /^[A-Za-z0-9_-]*$/

/** RFC 4648 §5 without padding, as PASETO requires. */
export function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64url')
}

/**
 * Strict decoder (PASETO Common.md: padding forbidden, non-zero trailing bits rejected).
 * Node's own decoder skips characters outside the alphabet ('ab$cd' === 'abcd'), accepts '='
 * and standard base64, and ignores trailing bits ('YR' === 'YQ'). So: check the alphabet,
 * refuse an impossible length, decode, and require re-encoding to give the input back
 * exactly. Never throws.
 */
export function decodeBase64UrlStrict(text: string): Uint8Array | null {
  if (typeof text !== 'string' || !ALPHABET.test(text) || text.length % 4 === 1) return null
  const bytes = Buffer.from(text, 'base64url')
  if (bytes.toString('base64url') !== text) return null
  return new Uint8Array(bytes)
}
