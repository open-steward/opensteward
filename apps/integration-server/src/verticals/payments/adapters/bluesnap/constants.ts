/**
 * BlueSnap Payment API (JSON), version 2. Every resource lives under the
 * `/services/2/` prefix.
 *
 * BlueSnap runs two isolated environments, each with its own API
 * credentials. The merchant selects one on the Connect form (`environment`
 * field); the client resolves the host from `credentials.extra.environment`.
 *
 * Docs: https://developers.bluesnap.com/reference/sandbox-production
 */
export const SANDBOX_BASE_URL = 'https://sandbox.bluesnap.com'
export const PRODUCTION_BASE_URL = 'https://ws.bluesnap.com'

/** Default to sandbox — production must be opted into explicitly. */
export const DEFAULT_ENVIRONMENT = 'sandbox'

export function baseUrlFor(environment: string | undefined): string {
  return environment === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

export const TRANSACTIONS_PATH = '/services/2/transactions'
export const VAULTED_SHOPPERS_PATH = '/services/2/vaulted-shoppers'
export const RECURRING_SUBSCRIPTIONS_PATH = '/services/2/recurring/subscriptions'
export const RECURRING_PLANS_PATH = '/services/2/recurring/plans'

/**
 * Retrieve All Subscriptions, `pagesize`: "Default is **10** if not set.
 * Maximum is **500**." Retrieve All Plans states no maximum, so this binds
 * subscriptions only (and is why the adapter declares no `maxPageSize`).
 * https://developers.bluesnap.com/v8976-JSON/reference/retrieve-all-subscriptions
 */
export const SUBSCRIPTIONS_MAX_PAGE_SIZE = 500

/** Page size sent when a direct call passes no `limit` (the value sent before paging). */
export const DEFAULT_LIST_PAGE_SIZE = 100
