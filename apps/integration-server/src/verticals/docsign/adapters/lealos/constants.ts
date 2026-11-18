/**
 * Lealos REST API constants.
 *
 * Lealos is a Korean e-signature provider. Authentication uses a Bearer
 * API key. Webhook signatures are HMAC-SHA256 in `X-Lealos-Signature`
 * (hex).
 *
 * NOTE: Lealos public API documentation is sparse — the endpoints below
 * follow REST conventions established by the platform's customer-facing
 * dashboard and known SDK snippets. They are best-guess defaults; the
 * canonical schema mapping (envelope = document, signers, audit history,
 * templates) remains correct regardless of endpoint shape adjustments.
 *
 * Docs: https://api.lealos.com/ (developer portal — limited public coverage)
 */
export const API_BASE_URL = 'https://api.lealos.com/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
