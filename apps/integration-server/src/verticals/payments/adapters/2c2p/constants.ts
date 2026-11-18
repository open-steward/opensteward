/**
 * 2C2P Payment Gateway (PGW) — Southeast-Asia-anchored gateway.
 *
 * Both environments share a versioned `/payment/{version}/` path prefix on the
 * REST host. The merchant picks an environment at Connect time; the choice
 * rides in `Credentials.extra.environment`.
 *
 * Docs: https://developer.2c2p.com/docs/reference-environment-guide
 */
export const HOSTS = {
  sandbox: 'https://sandbox-pgw.2c2p.com',
  production: 'https://pgw.2c2p.com',
} as const

export type TwoC2PEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: TwoC2PEnvironment = 'sandbox'

/**
 * 2C2P pins request/response shapes to a numeric API version baked into the
 * path (`/payment/4.3/...`). 4.3 is the current Payment API release.
 */
export const API_VERSION = '4.3'

/** Payment Inquiry endpoint — retrieve a transaction by merchant invoice no. */
export const PAYMENT_INQUIRY_PATH = `/payment/${API_VERSION}/paymentInquiry`

export const DEFAULT_PAGE_SIZE = 50
