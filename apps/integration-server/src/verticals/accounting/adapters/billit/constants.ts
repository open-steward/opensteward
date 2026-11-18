export const BILLIT_API_BASE_SANDBOX = 'https://api.sandbox.billit.be'
export const BILLIT_API_BASE_PROD = 'https://api.billit.be'

// Default to production; switch via env for sandbox testing
export const BILLIT_API_BASE = process.env['BILLIT_SANDBOX'] === 'true'
  ? BILLIT_API_BASE_SANDBOX
  : BILLIT_API_BASE_PROD

// Authentication header names
export const BILLIT_APIKEY_HEADER = 'apikey'
export const BILLIT_PARTYID_HEADER = 'partyID'

// Pagination: Billit's OData paging caps at 120 records per page
export const MAX_PAGE_SIZE = 120
export const DEFAULT_PAGE_SIZE = 100
