// Production base URL for the Sameday Courier REST API.
// Source: SamedayClient.php — const API_HOST = 'https://api.sameday.ro'
export const SAMEDAY_API_BASE = 'https://api.sameday.ro'

// Demo / sandbox base URL (for testing without real credentials).
export const SAMEDAY_DEMO_API_BASE = 'https://sameday-api.demo.zitec.com'

// Dashboard URL for obtaining credentials.
export const SAMEDAY_DASHBOARD_URL = 'https://www.sameday.ro'

// Sameday AWB PDF type: A4 or A6.
export const AWB_PDF_TYPE_A4 = 'A4'
export const AWB_PDF_TYPE_A6 = 'A6'

// Package types supported by Sameday.
export const PACKAGE_TYPE_PARCEL = 1   // standard parcel
export const PACKAGE_TYPE_ENVELOPE = 2 // envelope
export const PACKAGE_TYPE_LARGE = 3    // large package (non-standard)

// AWB payment type: 1 = client, 2 = recipient
export const AWB_PAYMENT_CLIENT = 1

// Default page size for paginated endpoints.
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// Upstream page size for list walks: the official PHP SDK's default
// `countPerPage` (SamedayRequestPaginationTrait.php: `protected $countPerPage = 50;`).
// Sameday documents no maximum, so lists never ask for more than this.
export const LIST_PAGE_SIZE = 50

// Upstream pages one list call may read before it gives up (a guard against a
// `pages` that never ends).
export const MAX_LIST_PAGES = 200
