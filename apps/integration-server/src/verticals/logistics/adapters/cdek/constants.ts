/**
 * CDEK API v2 constants.
 *
 * Production base URL: https://api.cdek.ru/v2
 * Test base URL:       https://api.edu.cdek.ru/v2
 *
 * Token endpoint:
 *   POST https://api.cdek.ru/v2/oauth/token
 *   grant_type=client_credentials&client_id=...&client_secret=...
 *
 * Tokens are valid for 3600 seconds (1 hour) by default.
 */

export const CDEK_API_BASE = 'https://api.cdek.ru/v2'
export const CDEK_TOKEN_URL = 'https://api.cdek.ru/v2/oauth/token'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 1000

/**
 * CDEK webhook event types.
 * ORDER_STATUS: fired when a shipment status changes.
 * PRINT_FORM:   fired when a label/waybill PDF is ready.
 * DOWNLOAD_PHOTO: fired when a delivery photo is available.
 */
export const CDEK_WEBHOOK_EVENTS = ['ORDER_STATUS', 'PRINT_FORM', 'DOWNLOAD_PHOTO'] as const
export type CdekWebhookEventType = (typeof CDEK_WEBHOOK_EVENTS)[number]
