/**
 * Yooz Rising REST API constants.
 *
 * Yooz Rising is an AI-powered AP automation platform.
 *
 * Auth model: API key — the caller holds a Bearer access token issued by Yooz
 * plus an applicationId UUID that identifies the registered integration app.
 * Both values are supplied once at credential-entry time and stored as
 * credentials.accessToken (Bearer) + credentials.extra.applicationId.
 *
 * Docs:
 *   Yooz Rising REST API User Manual (YoozRising_RestAPI_User_Manual_EN)
 *   https://www.postman.com/trgwareenan/trg-yooz/
 */

/** Yooz Rising REST API base URL */
export const YOOZ_API_BASE = 'https://app.yoozit.io/yooz/v2/api'

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
