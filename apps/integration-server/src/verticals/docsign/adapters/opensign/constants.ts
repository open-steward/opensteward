/**
 * OpenSign™ REST API constants.
 *
 * OpenSign is an open-source e-signature platform. Its public REST API is
 * versioned under `/api/v1.2` and authenticates with a static API token in
 * the `x-api-token` header — there is no OAuth flow. The cloud offers
 * regional hosts; self-hosted instances expose the same surface under a
 * customer-supplied base URL.
 *
 * Docs: https://docs.opensignlabs.com/docs/API-docs/v1.2/intro/
 */
export const API_VERSION = 'v1.2'

/** Production (US) host. */
export const PRODUCTION_BASE_URL = 'https://app.opensignlabs.com/api/v1.2'

/** Sandbox host for development + testing. */
export const SANDBOX_BASE_URL = 'https://sandbox.opensignlabs.com/api/v1.2'

/** EU-region production host. */
export const EU_BASE_URL = 'https://eu-app.opensignlabs.com/api/v1.2'

/** Header that carries the OpenSign API token on every request. */
export const API_TOKEN_HEADER = 'x-api-token'

/** Header OpenSign uses to ship the HMAC-SHA256 webhook signature. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * `documentlist/:reportId` ids OpenSign exposes. Each maps to a server-side
 * report definition (draft / in-progress / completed). listEnvelopes pages
 * across the non-draft states for a complete view of an account's
 * documents.
 */
export const DOCUMENT_REPORT_IDS = {
  inProgress: '1MwEuxLEkF',
  completed: 'kQUoW4hUXz',
} as const

/** Report ids fetched by listEnvelopes. */
export const DEFAULT_DOCUMENT_REPORTS: string[] = [
  DOCUMENT_REPORT_IDS.inProgress,
  DOCUMENT_REPORT_IDS.completed,
]
