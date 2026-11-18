/**
 * Fakturownia auth helpers.
 *
 * Fakturownia uses a static API token (no OAuth flow).
 * Credentials are collected via the Connect Link form using `simpleApiKey`.
 * The `account` subdomain is also required and stored in credentials.extra.
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Return credentials as-is — api_token auth requires no refresh cycle.
 * The token is long-lived and does not expire.
 */
export function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return Promise.resolve(credentials)
}
