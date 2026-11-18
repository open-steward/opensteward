/**
 * DocuSeal REST API constants.
 *
 * DocuSeal hosts two managed clusters — `api.docuseal.com` (US) and
 * `api.docuseal.eu` (EU) — plus self-hosted on-premises deployments. The
 * adapter pins the US base by default; self-hosted instances override the
 * base URL via the `baseUrl` connection field.
 *
 * Auth is a static API key passed in the `X-Auth-Token` header (no OAuth).
 *
 * Docs: https://www.docuseal.com/docs/api
 */
export const API_BASE_URL = 'https://api.docuseal.com'

/** EU-region managed cluster. */
export const API_BASE_URL_EU = 'https://api.docuseal.eu'

/** Header carrying the static API key. */
export const AUTH_HEADER = 'X-Auth-Token'

/** Header carrying the HMAC-SHA256 webhook signature. */
export const SIGNATURE_HEADER = 'x-docuseal-signature'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
