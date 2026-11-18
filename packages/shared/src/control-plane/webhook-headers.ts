/**
 * Validation for tenant-supplied outbound webhook headers.
 *
 * A subscription may carry custom headers so a delivery can authenticate to
 * a receiver that does not verify our HMAC — `Authorization: Bearer …` for a
 * plain HTTP endpoint, `DD-API-KEY` for Datadog. Everywhere else in this
 * codebase an outbound header is a fixed literal; this is the only path where
 * operator text becomes part of a request line, so it is validated once here
 * and never re-derived at the call site.
 *
 * Two rules carry the security:
 *
 *   - `x-oi-*` is reserved. Without that, a subscription could set its own
 *     `x-oi-signature` and every delivery would verify against a value the
 *     subscription chose rather than one we computed.
 *   - CR, LF and NUL are rejected rather than stripped. Silently mangling a
 *     credential yields a header that reads correctly in the admin UI and
 *     fails at the receiver, which is a worse failure than a 400 at save time.
 */

/** Maximum number of custom headers on one subscription. */
export const MAX_HEADERS = 10
/** Maximum serialized size of the whole header set, in bytes. */
export const MAX_HEADER_BYTES = 4096
const MAX_NAME_LENGTH = 64
const MAX_VALUE_LENGTH = 2048

/** RFC 9110 token — the grammar a header field name must satisfy. */
const TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/
/** Printable ASCII plus horizontal tab; excludes CR, LF, NUL by construction. */
const FIELD_VALUE = /^[\t\x20-\x7e]*$/

/**
 * Names a subscription may not set. Either we set them ourselves and an
 * override would corrupt the delivery (`x-oi-*`, `content-type`), or they
 * belong to the connection rather than the message (`host`,
 * `content-length`, hop-by-hop headers from RFC 9110 §7.6.1).
 */
const DENIED_NAMES = new Set([
  'host',
  'content-length',
  'content-type',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'expect',
  'user-agent',
])

/** Prefixes a subscription may not set, matched case-insensitively. */
const DENIED_PREFIXES = ['x-oi-', 'proxy-', 'sec-']

export type ValidateHeadersResult =
  { ok: true; value: Record<string, string> } | { ok: false; reason: string }

function isDenied(lowerName: string): boolean {
  if (DENIED_NAMES.has(lowerName)) return true
  return DENIED_PREFIXES.some((p) => lowerName.startsWith(p))
}

/**
 * Validate a custom header map. Returns the map unchanged on success — this
 * never rewrites, trims or normalises a value, because a credential that
 * survives validation must reach the receiver byte-for-byte.
 */
export function validateHeaders(input: Record<string, string>): ValidateHeadersResult {
  const names = Object.keys(input)

  if (names.length > MAX_HEADERS) {
    return { ok: false, reason: `at most ${MAX_HEADERS} custom headers are allowed` }
  }

  const seen = new Set<string>()
  let bytes = 0

  for (const name of names) {
    const value = input[name]

    if (typeof value !== 'string') {
      return { ok: false, reason: `header "${name}" must have a string value` }
    }
    if (!TOKEN.test(name)) {
      return {
        ok: false,
        reason: `"${name}" is not a valid header name (letters, digits and !#$%&'*+-.^_\`|~ only)`,
      }
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { ok: false, reason: `header name "${name}" exceeds ${MAX_NAME_LENGTH} characters` }
    }
    if (!FIELD_VALUE.test(value)) {
      return {
        ok: false,
        reason: `the value for "${name}" contains a character that is not allowed in a header (line breaks and non-ASCII text are rejected, not stripped)`,
      }
    }
    if (value.length > MAX_VALUE_LENGTH) {
      return { ok: false, reason: `the value for "${name}" exceeds ${MAX_VALUE_LENGTH} characters` }
    }

    const lower = name.toLowerCase()
    if (isDenied(lower)) {
      return { ok: false, reason: `"${name}" is reserved and not allowed as a custom header` }
    }
    if (seen.has(lower)) {
      return { ok: false, reason: `duplicate header name "${name}" (names are case-insensitive)` }
    }
    seen.add(lower)

    // +4 approximates the ": " and CRLF a real header line carries, so the
    // cap tracks what goes on the wire rather than just the payload text.
    bytes += Buffer.byteLength(name, 'utf8') + Buffer.byteLength(value, 'utf8') + 4
  }

  if (bytes > MAX_HEADER_BYTES) {
    return { ok: false, reason: `the header set is too large (limit ${MAX_HEADER_BYTES} bytes)` }
  }

  return { ok: true, value: input }
}
