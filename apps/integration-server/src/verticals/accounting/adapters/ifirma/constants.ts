/**
 * iFirma API constants.
 *
 * Base URL: https://www.ifirma.pl/iapi/
 * Auth: HMAC-SHA1 symmetric key
 *   Header: Authentication: IAPIS user=<login>, hmac-sha1=<hash>
 *   Hash:   hmac_sha1(hex_key_as_bytes, url + login + keyName + requestBody)
 *
 * Key names per resource:
 *   faktura  – invoices, contacts
 *   wydatek  – expenses
 *   abonent  – subscriber / account info
 *
 * Rate limit: 100 req/min, 15 000 req/day
 */

export const IFIRMA_API_BASE = 'https://www.ifirma.pl/iapi'

// Key name identifiers used in HMAC construction
export const KEY_NAME_FAKTURA = 'faktura'
export const KEY_NAME_WYDATEK = 'wydatek'
export const KEY_NAME_ABONENT = 'abonent'

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// Rate limits
export const RATE_LIMIT_RPM = 100
export const RATE_LIMIT_PER_DAY = 15_000
