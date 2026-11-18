/**
 * Tink API constants.
 *
 * Host: the API reference bundle's config, `apiDomain:"https://api.tink.com"`
 * (https://docs.tink.com/assets/index-B4kBBo6S.js, loaded by https://docs.tink.com/api).
 *
 * Token endpoint: "POST https://api.tink.com/api/v1/oauth/token" with
 * `-d 'grant_type=client_credentials'`
 * (https://docs.tink.com/resources/api-setup/get-access-token).
 */

export const API_BASE_URL = 'https://api.tink.com'
export const OAUTH_TOKEN_URL = 'https://api.tink.com/api/v1/oauth/token'

/**
 * The read scope of every settlement-account endpoint this adapter calls.
 * Each one's "Works with" block lists two alternatives, "Client token
 * settlement-accounts:readonly" and "Client token settlement-accounts"
 * (https://docs.tink.com/api#payment/settlement-accounts/list-transactions);
 * the read-only one is enough.
 */
export const SETTLEMENT_READ_SCOPE = 'settlement-accounts:readonly'

/**
 * Scopes requested on every client_credentials grant. Fixed: nothing
 * (neither the platform config's `scopes` nor the connection) overrides
 * them, so the token is always read-only.
 */
export const DEFAULT_SCOPES: string[] = [SETTLEMENT_READ_SCOPE]

/** `/payment/v1/merchants/{merchantId}/accounts/{accountId}` */
export function settlementAccountPath(merchantId: string, accountId: string): string {
  return `/payment/v1/merchants/${encodeURIComponent(merchantId)}/accounts/${encodeURIComponent(accountId)}`
}
