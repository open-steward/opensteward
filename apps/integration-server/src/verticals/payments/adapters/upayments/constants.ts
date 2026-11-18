/**
 * https://developers.upayments.com/reference/go-live-checklist.md:
 * "**Production API**: `https://uapi.upayments.com/api/v1/`". The sandbox is
 * `https://sandboxapi.upayments.com/api/v1/`; the adapter has no environment
 * key, so it talks to production only.
 */
export const API_BASE_URL = 'https://uapi.upayments.com/api/v1'
