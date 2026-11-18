/**
 * IXOPAY Gateway API constants.
 *
 * IXOPAY is a payment-orchestration gateway. It exposes a single host
 * (`gateway.ixopay.com`) for both test and live traffic — the distinction is
 * the *connector* the merchant points at (a test vs. live connector), not a
 * separate hostname. The connector's API key is part of every transaction
 * path and its shared secret is the HMAC key (see `auth.ts` / `client.ts`).
 *
 * The v3 JSON transaction API base URL is `https://gateway.ixopay.com/api/v3`.
 * Routes by URL segment (relative to base):
 *   POST /transaction/{apiKey}/{type}                         (debit, capture, void, refund, …)
 *   GET  /status/{apiKey}/getByUuid/{uuid}                    (by gateway reference / uuid)
 *   GET  /status/{apiKey}/getByMerchantTransactionId/{id}     (by merchant transaction id)
 *   POST /customerProfiles/{apiKey}/getProfile                (stored customer profile)
 *
 * Docs: https://documentation.ixopay.com/api/transaction/transaction-api
 *       https://gateway.ixopay.com/Schema/V3/OpenApiSpecification.yml
 */
export const API_BASE_URL = 'https://gateway.ixopay.com/api/v3'

/** Content type for the v3 JSON API — the exact value is part of the signature. */
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'

/**
 * Transaction-type path segments under `/transaction/{apiKey}/`. IXOPAY does
 * not paginate or list — transactions are addressed individually by gateway
 * reference (uuid) or by the merchant's own transaction id.
 */
export const TRANSACTION_TYPES = {
  debit: 'debit',
  preauthorize: 'preauthorize',
  capture: 'capture',
  void: 'void',
  refund: 'refund',
  register: 'register',
  deregister: 'deregister',
  payout: 'payout',
} as const
