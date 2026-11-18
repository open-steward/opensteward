/**
 * SaldeoSMART API constants.
 *
 * REST base URL: https://api.saldeosmart.pl/api/xml/1.0
 * Auth: username + req_sig (MD5 HMAC over sorted params + api_token)
 *
 * Docs: https://saldeo.brainshare.pl/static/doc/api/index.html
 * API specification PDF (v4.0.0, 02.2024):
 *   https://systemsaldeo.pl/pliki/SaldeoSMART%20-%20Specyfikacja%20API.pdf
 */

export const SALDEO_API_BASE = 'https://api.saldeosmart.pl/api/xml/1.0'

// Endpoints
export const ENDPOINT_COMPANY_LIST = 'company/list'
export const ENDPOINT_CONTRACTOR_LIST = 'contractor/list'
export const ENDPOINT_CONTRACTOR_MERGE = 'contractor/merge'
export const ENDPOINT_DOCUMENT_LIST = 'document/list'
export const ENDPOINT_DOCUMENT_ADD = 'document/add'

// document.list policy values
export const POLICY_ALL = 'SALDEO'
export const POLICY_LAST_10_DAYS = 'LAST_10_DAYS'
export const POLICY_LAST_10_DAYS_OCRED = 'LAST_10_DAYS_OCRED'

// Pagination
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500
