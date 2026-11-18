/**
 * Cloze API constants.
 *
 * Docs: https://developer.cloze.com/  (Swagger UI at https://api.cloze.com/api-docs/)
 * Base URL is the same for all environments — Cloze is SaaS-only (no sandbox).
 */

export const CLOZE_BASE_URL = 'https://api.cloze.com'

/** Default page size used for find/list calls. */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum page size accepted by the Cloze API. */
export const MAX_PAGE_SIZE = 100
