/**
 * VosFactures API constants.
 *
 * The VosFactures REST API is account-scoped: every tenant has its own
 * subdomain `https://<account>.vosfactures.fr`.  The account subdomain is
 * supplied by the user during credential exchange and stored on
 * `credentials.extra.accountName`.
 *
 * Auth: API token passed as the `api_token` query-string parameter on every
 * request (no OAuth, no refresh needed).
 *
 * Docs: https://github.com/vosfactures/API
 */

/** Build the per-tenant base URL from the account subdomain. */
export function vosfacturesBaseUrl(accountName: string): string {
  return `https://${accountName}.vosfactures.fr`
}

// Pagination: max 100 per page (platform cap)
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25
