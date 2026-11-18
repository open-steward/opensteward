// Yuki uses a SOAP-based API (not REST).
// All webservices are at https://api.yukiworks.nl/ws/<Service>.asmx
// Auth: call Authenticate(accessKey) → returns sessionID per request.
// Rate limit: 1 000 calls/day per domain (default).

export const YUKI_API_BASE = 'https://api.yukiworks.nl/ws'

export const YUKI_SALES_WSDL = `${YUKI_API_BASE}/Sales.asmx`
export const YUKI_ACCOUNTING_WSDL = `${YUKI_API_BASE}/Accounting.asmx`
export const YUKI_ACCOUNTING_INFO_WSDL = `${YUKI_API_BASE}/AccountingInfo.asmx`
export const YUKI_CONTACT_WSDL = `${YUKI_API_BASE}/Contact.asmx`

// SOAP namespaces
export const YUKI_SOAP_NS = 'http://www.theyukicompany.com/'

// Pagination — Yuki SearchContacts uses pageNumber (1-based)
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

// Rate limit hint (calls per day, not per second)
export const RATE_LIMIT_CPD = 1000
