/**
 * Paysafe Payments API constants.
 *
 * Paysafe exposes a unified, resource-oriented REST API. The Payments API
 * resources (payments, settlements, refunds, voidauths, standalonecredits)
 * live under the `/paymenthub/v1` prefix; customer profiles live under the
 * Customer Vault prefix `/customervault/v1`.
 *
 * Hosts are environment-bound: a Test key only works against the test host
 * and a Production key only against the production host. The host is selected
 * on the Connect Link form (`environment` field) and stored on the credential.
 *
 * Docs:
 *   - https://developer.paysafe.com/en/support/reference-information/rest-api-architecture/
 *   - https://developer.paysafe.com/en/support/reference-information/pagination/
 */

export const TEST_BASE_URL = 'https://api.test.paysafe.com'
export const PRODUCTION_BASE_URL = 'https://api.paysafe.com'

/** Default to the test host so an un-flagged credential never hits production. */
export const DEFAULT_BASE_URL = TEST_BASE_URL

/** Unified Payments API resource prefix. */
export const PAYMENT_HUB_PREFIX = '/paymenthub/v1'
/** Customer Vault resource prefix. */
export const CUSTOMER_VAULT_PREFIX = '/customervault/v1'

export const PAYMENTS_PATH = `${PAYMENT_HUB_PREFIX}/payments`
export const SETTLEMENTS_PATH = `${PAYMENT_HUB_PREFIX}/settlements`
export const REFUNDS_PATH = `${PAYMENT_HUB_PREFIX}/refunds`
export const PROFILES_PATH = `${CUSTOMER_VAULT_PREFIX}/profiles`

/** Payment Scheduler API resource prefix. */
export const SUBSCRIPTION_PLANS_PREFIX = '/subscriptionsplans/v1'

export const PLANS_PATH = `${SUBSCRIPTION_PLANS_PREFIX}/plans`
export const SUBSCRIPTIONS_PATH = `${SUBSCRIPTION_PLANS_PREFIX}/subscriptions`

/**
 * Paysafe paginates with `limit` + `offset`. `limit` defaults to 10 and is
 * capped at 50; `offset` is 0-based. The total record count is NOT returned —
 * a short page (`numberOfRecords < limit`) signals the end of the list.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50
