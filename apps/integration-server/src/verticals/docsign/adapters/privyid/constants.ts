/**
 * Privy (PrivyID) merchant REST API constants.
 *
 * Privy is Indonesia's certified digital-identity and digital-signature
 * platform (privy.id). Enterprise integrations call the versioned
 * "merchant" REST API: a registered merchant uploads a document, Privy
 * shares it with the recipients (Signers / Reviewers), and the merchant
 * polls document status or receives status callbacks.
 *
 * Auth is a static per-merchant key sent in the `Merchant-Key` request
 * header — there is no OAuth Authorization-Code flow for the merchant API —
 * so the Connect Link credential form collects the key (plus the
 * environment, which selects the API host).
 *
 * Resource paths nest under `/v3/merchant/...`. A *document* IS the
 * envelope: it carries its recipients, the uploaded file, the owner and
 * status inline.
 *
 * Product: https://privy.id/
 * API: https://api-sandbox.privy.id/v3/merchant (sandbox),
 *      https://core.privy.id/v3/merchant (production)
 */

/** Production merchant REST host + path prefix. */
export const PROD_BASE_URL = 'https://core.privy.id'

/** Sandbox merchant REST host + path prefix. */
export const SANDBOX_BASE_URL = 'https://api-sandbox.privy.id'

/** Environment slug → API host. The credential form offers these as a closed set. */
export const ENVIRONMENT_BASE_URLS: Record<string, string> = {
  production: PROD_BASE_URL,
  sandbox: SANDBOX_BASE_URL,
}

/** Default host when the customer does not pick an environment. */
export const API_BASE_URL = PROD_BASE_URL

/** All merchant resources are versioned under `/v3/merchant`. */
export const API_PREFIX = '/v3/merchant'

/** Privy `document/list` is page-based; the documented page cap is 100. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
