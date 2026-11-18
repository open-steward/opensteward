/**
 * D4Sign REST API constants.
 *
 * D4Sign is a Brazilian e-signature provider. Authentication uses TWO
 * tokens: `tokenAPI` (account-scoped) and `cryptKey` (a per-call HMAC
 * helper). Both ship as query-string parameters on every request.
 *
 * Webhooks are signed with HMAC-SHA256 in `X-D4Sign-Signature` (hex).
 *
 * Docs: https://docapi.d4sign.com.br/docs
 */
export const API_BASE_URL = 'https://secure.d4sign.com.br/api/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * D4Sign status codes are integer-coded; doc string mappings vary across
 * SDKs. Best-effort coverage below — anything unrecognised falls back to
 * draft.
 *  1 = processing/draft
 *  2 = waiting to be signed (sent)
 *  3 = waiting to be signed (sent, alternate)
 *  4 = finished/completed
 *  5 = cancelled
 *  6 = rejected/declined
 *  7 = expired
 */
