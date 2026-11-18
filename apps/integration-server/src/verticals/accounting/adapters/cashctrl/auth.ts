/**
 * CashCtrl auth helpers.
 *
 * CashCtrl uses a static API key (no OAuth flow).
 * Credentials are collected via the Connect Link form.
 * Two fields are required:
 *   - API key  → stored in credentials.accessToken
 *   - Org name → the customer-specific subdomain, stored in credentials.extra.orgName
 *
 * Auth on every request: HTTP Basic, API key as username, empty password.
 * Example: Authorization: Basic base64(apiKey:)
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html
 */
import type { Credentials } from '../../adapter/interface'

/**
 * CashCtrl API keys are long-lived and do not expire.
 * Return credentials as-is — no refresh cycle needed.
 */
export function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return Promise.resolve(credentials)
}

/**
 * Build the Basic auth header value for a CashCtrl API key.
 * Format: base64("apiKey:")
 */
export function buildBasicAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64')
  return `Basic ${encoded}`
}
