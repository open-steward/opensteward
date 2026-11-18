/**
 * Signaturit REST API v3 constants.
 *
 * Docs: https://docs.signaturit.com/api/latest — Iberian eIDAS-qualified
 * trust service provider (Spain). API-key auth.
 */
export const API_BASE_URL = 'https://api.signaturit.com/v3'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES: string[] = []

/**
 * GET /v3/signatures.json: "Note that the result window size (limit +
 * offset) cannot exceed 10.000".
 */
export const MAX_RESULT_WINDOW = 10_000
