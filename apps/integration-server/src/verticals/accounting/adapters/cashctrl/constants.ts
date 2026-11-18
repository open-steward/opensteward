/**
 * CashCtrl API constants.
 *
 * Each CashCtrl organisation lives at a customer-chosen subdomain:
 *   https://{orgName}.cashctrl.com/api/v1/
 *
 * Auth: HTTP Basic Authentication — API key as the username, empty password.
 * Obtain the API key under Settings → Users → API key.
 *
 * The org name (subdomain) is collected in the Connect Link form and stored
 * in credentials.extra.orgName. The API key is stored in credentials.accessToken.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html
 */

/** Build the base URL for a given CashCtrl org subdomain. */
export const CASHCTRL_API_BASE = (orgName: string): string =>
  `https://${orgName}.cashctrl.com/api/v1`

/** CashCtrl does not publish a strict rate-limit; 120 req/min is a safe default. */
export const RATE_LIMIT_RPM = 120

/** CashCtrl list endpoints accept up to 200 results per page. */
export const MAX_PAGE_SIZE = 200

/** Default page size for list requests. */
export const DEFAULT_PAGE_SIZE = 100
