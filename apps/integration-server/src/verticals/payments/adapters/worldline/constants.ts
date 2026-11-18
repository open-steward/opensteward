/**
 * Worldline Direct REST API (v2).
 *
 * The PSPID / merchantId is part of every resource path
 *   /v2/{merchantId}/payments/{paymentId}
 * so it is supplied per credential rather than baked into the base URL.
 *
 * Docs: https://docs.direct.worldline-solutions.com/en/integration/api-developer-guide/api
 */
export const SANDBOX_BASE_URL = 'https://payment.preprod.direct.worldline-solutions.com'
export const PRODUCTION_BASE_URL = 'https://payment.direct.worldline-solutions.com'

/** API major-version segment that prefixes every resource path. */
export const API_VERSION = 'v2'

export const DEFAULT_PAGE_SIZE = 50
