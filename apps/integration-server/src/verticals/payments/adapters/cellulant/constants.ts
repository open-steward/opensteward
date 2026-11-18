/**
 * Cellulant (Tingg) Checkout API constants.
 *
 * Tingg is a host-per-environment API: the same host serves every
 * checkout-api resource, and the environment is chosen by host (not by a
 * mode flag). The "approval" host is the sandbox / UAT environment.
 *
 *   Sandbox:    https://api-approval.tingg.africa
 *   Production: https://api.tingg.africa
 *
 * Auth is OAuth2 `client_credentials` against a versioned token endpoint
 * (`/v1/oauth/token/request`); the checkout resources live under
 * `/v3/checkout-api/`. Every authenticated request carries BOTH an
 * `Authorization: Bearer <jwt>` header and an `apikey` header.
 *
 * Docs: https://docs.tingg.africa/reference/authenticate-requests
 */
export const SANDBOX_BASE_URL = 'https://api-approval.tingg.africa'
export const PRODUCTION_BASE_URL = 'https://api.tingg.africa'

/** OAuth2 token endpoint (client_credentials grant). */
export const TOKEN_PATH = '/v1/oauth/token/request'

// ── Checkout-API endpoint paths (v3) ─────────────────────────────────────────

/** Initiate a checkout / charge request: POST /v3/checkout-api/checkout/request */
export const CHECKOUT_REQUEST_PATH = '/v3/checkout-api/checkout/request'

/** Initiate a refund: POST /v3/checkout-api/refund/request */
export const REFUND_REQUEST_PATH = '/v3/checkout-api/refund/request'

/**
 * Query the status of a previously raised request:
 *   GET /v3/checkout-api/query/{serviceCode}/{merchantTransactionId}
 */
export function queryStatusPath(serviceCode: string, merchantTransactionId: string): string {
  return `/v3/checkout-api/query/${encodeURIComponent(serviceCode)}/${encodeURIComponent(
    merchantTransactionId,
  )}`
}

/**
 * Resolve the API host. The customer indicates environment on the Connect
 * form (`environment` field); default to production when unset.
 */
export function baseUrlFor(environment: string | undefined): string {
  return environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
}
