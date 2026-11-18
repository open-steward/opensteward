/**
 * ActiveCollab Cloud REST API.
 *
 * Cloud instances are addressed per-account: every request path is prefixed
 * with the numeric account (instance) id, e.g.
 *   https://app.activecollab.com/148987/api/v1/projects
 *
 * Self-hosted instances expose the same /api/v1 surface under their own host.
 * The account id (cloud) or full base origin (self-hosted) is collected on the
 * Connect Link form and stored on `credentials.extra.accountId`.
 */
export const CLOUD_API_HOST = 'https://app.activecollab.com'
export const API_VERSION_PATH = 'api/v1'

/** Where a cloud user generates an API token. */
export const TOKEN_HELP_URL =
  'https://activecollab.com/help/books/my-active-collab/api-authentication'

/** Header carrying the API token on every request. */
export const AUTH_TOKEN_HEADER = 'X-Angie-AuthApiToken'

/** Optional shared secret echoed back on every webhook delivery. */
export const WEBHOOK_SECRET_HEADER = 'X-Angie-WebhookSecret'

/** ActiveCollab returns full collections; large lists page via `?page=N` (1-based). */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Build the per-account REST base URL.
 *
 * - Cloud: pass the numeric account id → https://app.activecollab.com/{id}/api/v1
 * - Self-hosted: pass the instance origin (e.g. https://ac.example.com) → {origin}/api/v1
 */
export function buildBaseUrl(accountIdOrOrigin: string): string {
  const value = (accountIdOrOrigin ?? '').trim().replace(/\/+$/, '')
  if (/^https?:\/\//i.test(value)) {
    return `${value}/${API_VERSION_PATH}`
  }
  return `${CLOUD_API_HOST}/${value}/${API_VERSION_PATH}`
}
