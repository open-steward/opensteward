/**
 * Certinal eSign REST API constants ("Remote signing V1").
 *
 * Certinal is hosted per-tenant: the customer copies an "API URL" together
 * with a Client ID and Secret from the Custom Integration they create in
 * Certinal eSign (More tab → Create Custom Integration). The adapter mints a
 * Bearer token with the OAuth2 client_credentials grant on that host and
 * calls the REST API on the same host.
 *
 * The first-class resource is the Transaction (canonical Envelope). A
 * transaction nests its participants (signers), documents, and custom
 * fields; the audit trail is synthesised from transaction + participant
 * action timestamps.
 *
 * Docs: https://certinal.stoplight.io/docs/api/72b66de24898e-introduction
 * Auth: https://certinal.stoplight.io/docs/api/b6b6c2d4906e9-authentication
 */

/**
 * REST prefix. Every operation in the published reference hangs off it, e.g.
 * `GET https://esign-staging.certinal.com/rssp/v1/transactions/{transactionId}`
 * with "Security: Bearer Auth".
 * https://certinal.stoplight.io/docs/api/e750bb3f1df32-get-transaction-details-by-transaction-id
 * (rendered 2026-09-28)
 */
export const API_PREFIX = '/rssp/v1'

/**
 * OAuth2 client_credentials token endpoint, on the tenant host:
 * `POST https://esign-staging.certinal.com/auth/v1/token` ("Security: Basic
 * Auth", `grant_type` query parameter, form body with required `user_email`).
 * https://certinal.stoplight.io/docs/api/0bc4fc4f90ef6-o-auth-2-0-client-credentials-grant-flow-api
 * https://certinal.stoplight.io/docs/api/q8v4vixymc0m7-o-auth-2-0-client-credentials-grant-flow-api
 * (both rendered 2026-09-28)
 */
export const TOKEN_PATH = '/auth/v1/token'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Transaction-level callback events Certinal can register for the
 * "When a Transaction Status is Changed" trigger.
 */
export const DEFAULT_CALLBACK_EVENTS = [
  'TRANSACTION_SENT',
  'TRANSACTION_COMPLETED',
  'TRANSACTION_DECLINED',
  'TRANSACTION_EXPIRED',
  'TRANSACTION_VOIDED',
]
