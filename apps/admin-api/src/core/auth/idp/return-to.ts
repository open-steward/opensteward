/**
 * Open-redirect protection for the post-login `return_to` target.
 *
 * Only same-origin relative paths are allowed: must start with a single '/'
 * and must not be protocol-relative ('//host') or contain a scheme.
 */
const SCHEME_LIKE = /^\/+[a-z][a-z0-9+.-]*:/i

function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    // Control chars (browsers may normalise) and backslash (0x5c).
    if (code <= 0x1f || code === 0x5c) return true
  }
  return false
}

export function sanitizeReturnTo(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback
  if (SCHEME_LIKE.test(value)) return fallback
  if (hasUnsafeChars(value)) return fallback
  return value
}
