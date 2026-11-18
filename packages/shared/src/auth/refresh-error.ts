/**
 * Classify a thrown error from `adapter.refreshCredentials` into one of three
 * buckets so the caller can react correctly:
 *
 *   - `invalid_client` — the PLATFORM's OAuth app credentials (client_id /
 *     client_secret the operator configured) were rejected. Affects EVERY
 *     connection for that platform; the operator must fix the client
 *     credentials. Customer re-authorization will NOT help.
 *   - `invalid_grant` — this customer's grant/refresh token is dead
 *     (`invalid_grant` / `unauthorized_client` / `invalid_token`). The
 *     customer must re-authorize this one connection.
 *   - `transient` — network / 5xx / rate-limit. Retryable next tick.
 *
 * The check is deliberately permissive — adapters use Axios, fetch, plain
 * Errors with the OAuth code in the message, and a few wrap the upstream
 * response body in `.cause`. We walk all common shapes.
 */

// Customer-grant failures: the per-connection authorization is dead.
const GRANT_OAUTH_CODES = new Set(['invalid_grant', 'unauthorized_client', 'invalid_token'])
// Platform-credential failures: the operator's client_id/client_secret is bad.
const CLIENT_OAUTH_CODES = new Set(['invalid_client'])

export type RefreshErrorKind = 'invalid_client' | 'invalid_grant' | 'transient'

interface ErrLike {
  message?: unknown
  response?: { data?: unknown; status?: number }
  data?: unknown
  cause?: unknown
}

function extractErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const b = body as Record<string, unknown>
  if (typeof b['error'] === 'string') return b['error']
  // Some providers nest under `error.code`.
  if (typeof b['error'] === 'object' && b['error']) {
    const inner = (b['error'] as Record<string, unknown>)['code']
    if (typeof inner === 'string') return inner
  }
  return undefined
}

/**
 * Walk all common error shapes and return the first matching OAuth code from
 * `codes`, or check the message/cause. Some providers signal a bad client
 * secret as a token-endpoint 401 with "client authentication failed" text
 * rather than a clean `invalid_client` code — `messageHints` covers those.
 */
function matchesOAuthError(err: unknown, codes: Set<string>, messageHints: string[] = []): boolean {
  if (!err) return false

  if (err instanceof Error) {
    for (const code of codes) {
      if (err.message.includes(code)) return true
    }
    const lower = err.message.toLowerCase()
    if (messageHints.some((h) => lower.includes(h))) return true
  }

  const e = err as ErrLike
  const respCode = extractErrorCode(e.response?.data)
  if (respCode && codes.has(respCode)) return true

  const directCode = extractErrorCode(e.data) ?? extractErrorCode(err)
  if (directCode && codes.has(directCode)) return true

  if (e.cause) return matchesOAuthError(e.cause, codes, messageHints)

  return false
}

/** The PLATFORM's client_id/client_secret was rejected (operator must fix). */
export function isInvalidClient(err: unknown): boolean {
  return matchesOAuthError(err, CLIENT_OAUTH_CODES, ['client authentication failed'])
}

/** This customer's grant/refresh token is dead (customer must re-authorize). */
export function isInvalidGrant(err: unknown): boolean {
  // `invalid_client` is a platform problem, not a grant problem — and it must
  // not be reported as "customer must re-authorize". Check it first and bail.
  if (isInvalidClient(err)) return false
  return matchesOAuthError(err, GRANT_OAUTH_CODES)
}

/**
 * Single 3-way classifier shared by every refresh call site. `invalid_client`
 * takes precedence over `invalid_grant` (a bad client secret can surface as
 * either code from some providers; the platform-level cause is the actionable one).
 */
export function classifyRefreshError(err: unknown): RefreshErrorKind {
  if (isInvalidClient(err)) return 'invalid_client'
  if (isInvalidGrant(err)) return 'invalid_grant'
  return 'transient'
}

/** Longest reason we will persist. Providers occasionally return prose. */
const MAX_REASON_LENGTH = 300

/** Pull `error_description` (or `message`) out of an OAuth error body. */
function extractErrorDescription(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const b = body as Record<string, unknown>
  if (typeof b['error_description'] === 'string') return b['error_description']
  if (typeof b['error'] === 'object' && b['error']) {
    const inner = (b['error'] as Record<string, unknown>)['message']
    if (typeof inner === 'string') return inner
  }
  if (typeof b['message'] === 'string') return b['message']
  return undefined
}

/**
 * A short, operator-readable reason a refresh failed — stored on the connection
 * row and shown in the admin UI.
 *
 * Deliberately narrow about what it copies: the OAuth `error` code, its
 * `error_description`, the HTTP status, and otherwise the error's own message.
 * Never the response body, the request headers, or the axios `config` — a
 * refresh error carries the client credentials in `config.headers` and the
 * refresh token in `config.data`, and this string is persisted — copying the
 * axios config would put client credentials and refresh tokens into the
 * database.
 *
 * Without this the keep-alive worker records only a status, so a connection can
 * fail to refresh for hours with nothing anywhere saying why.
 */
export function describeRefreshError(err: unknown): string {
  const parts: string[] = []

  const walk = (node: unknown, depth: number): void => {
    if (!node || depth > 3) return
    const e = node as ErrLike & { code?: unknown; status?: number }
    const status = e.response?.status ?? (typeof e.status === 'number' ? e.status : undefined)
    const code =
      extractErrorCode(e.response?.data) ?? extractErrorCode(e.data) ?? extractErrorCode(node)
    const description = extractErrorDescription(e.response?.data) ?? extractErrorDescription(e.data)

    if (code) parts.push(code)
    if (description) parts.push(description)
    if (status !== undefined) parts.push(`HTTP ${status}`)
    if (!parts.length && e.cause) walk(e.cause, depth + 1)
  }
  walk(err, 0)

  if (!parts.length) {
    // No OAuth shape: a network error, or something unrecognised. The message
    // is all there is — `connect ETIMEDOUT …`, `getaddrinfo ENOTFOUND …`.
    if (err instanceof Error && err.message) parts.push(err.message)
    else if (typeof (err as { code?: unknown })?.code === 'string') {
      parts.push(String((err as { code: string }).code))
    } else parts.push('Refresh failed for an unrecognised reason')
  }

  const reason = parts.join(' — ')
  return reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH - 1)}…` : reason
}

/**
 * Map a refresh error to the `last_refresh_status` to persist:
 *   invalid_client → 'platform_error' (operator must fix client id/secret)
 *   invalid_grant  → 'expired'        (customer must re-authorize)
 *   transient      → 'failed'         (retry next tick)
 */
export function refreshStatusForError(err: unknown): 'platform_error' | 'expired' | 'failed' {
  switch (classifyRefreshError(err)) {
    case 'invalid_client':
      return 'platform_error'
    case 'invalid_grant':
      return 'expired'
    default:
      return 'failed'
  }
}
