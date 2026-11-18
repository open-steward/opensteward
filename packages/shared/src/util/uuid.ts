/**
 * RFC 4122 UUID (any version). Tighter than allow-anything but loose
 * enough to accept any UUID we mint via `crypto.randomUUID()` (which
 * emits v4) plus any externally-supplied valid UUID.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
