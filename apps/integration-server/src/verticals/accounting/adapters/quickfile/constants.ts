export const QUICKFILE_API_BASE = 'https://api.quickfile.co.uk/1_2'

// Rate limit: ~60 req/min recommended by QuickFile
export const RATE_LIMIT_RPM = 60
export const MAX_PAGE_SIZE = 200
export const DEFAULT_PAGE_SIZE = 100

/**
 * Invoice_Search `ReturnCount`: "Minimum inclusive value: 1, Maximum inclusive
 * value: 200" (https://api.quickfile.co.uk/d/v1_2/Invoice_Search).
 */
export const INVOICE_SEARCH_MAX_RETURN = 200
