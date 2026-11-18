/**
 * Proof (proof.com) REST API constants.
 *
 * Proof exposes TWO REST hosts — one per environment:
 *   - Production: `https://api.proof.com/v1`
 *   - Fairfax (sandbox/QA): `https://api.fairfax.proof.com/v1`
 *
 * The environment is selected by hostname, not by API-key prefix.  Fairfax
 * accounts require an API key minted in the Fairfax dashboard — production
 * keys do not work against the Fairfax host and vice-versa.  As an
 * implementation heuristic the client derives the host from the key prefix
 * (`prf_test_…` / `prf_cli_test_…` → Fairfax) so callers do not have to
 * pass a separate environment flag.
 *
 * Auth is a custom `ApiKey` header carrying the raw key (no Bearer prefix).
 *
 * Docs: https://dev.proof.com/docs/environments
 */
export const API_BASE_URL_PRODUCTION = 'https://api.proof.com/v1'
export const API_BASE_URL_SANDBOX = 'https://api.fairfax.proof.com/v1'

/**
 * Return the correct base URL for the given API key.
 * Sandbox keys are prefixed `prf_test_` or `prf_cli_test_`.
 */
export function baseUrlForKey(apiKey: string): string {
  const k = typeof apiKey === 'string' ? apiKey : ''
  return k.startsWith('prf_test_') || k.startsWith('prf_cli_test_')
    ? API_BASE_URL_SANDBOX
    : API_BASE_URL_PRODUCTION
}

/** Header that carries the raw Proof API key. */
export const API_KEY_HEADER = 'ApiKey'

/** Transactions list/get is offset+limit paginated. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

/** Header carrying the HMAC-SHA256 webhook signature (lower-cased). */
export const WEBHOOK_SIGNATURE_HEADER = 'x-notarize-signature'
