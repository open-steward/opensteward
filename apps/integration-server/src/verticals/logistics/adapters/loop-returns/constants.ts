export const LOOP_RETURNS_API_BASE = 'https://api.loopreturns.com/api/v1'

// Loop Returns uses API key auth via the X-Authorization header
export const LOOP_RETURNS_DASHBOARD_URL =
  'https://admin.loopreturns.com/returns-management/tools-and-integrations/developer-tools'

// Rate limits: Loop Returns does not publish a specific rate limit; ASN endpoint returns up to 200/page
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200
export const MAX_DATE_RANGE_DAYS = 120
// GET /label-requests: `limit` is documented with `maximum: 250` (default 50).
export const LABEL_REQUESTS_MAX_LIMIT = 250

// Webhook: Loop Returns signs payloads with HMAC-SHA256 (base64) in X-Loop-Signature
export const LOOP_RETURNS_SIGNATURE_HEADER = 'x-loop-signature'
