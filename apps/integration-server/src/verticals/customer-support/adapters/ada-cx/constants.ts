/**
 * Ada CX API constants. Every value below is quoted from docs.ada.cx.
 *
 * Host: "https://<YOUR-BOT-HANDLE>.ada.support"
 * (https://docs.ada.cx/reference/data-export/getting-started). The bot handle
 * is stored in credentials.extra.botHandle at exchange time.
 */
export const API_BASE_URL_TEMPLATE = 'https://{botHandle}.ada.support'

/**
 * Data Export API, "GET https://example.ada.support/api/v2/export/conversations"
 * (https://docs.ada.cx/data-export-conversation-object/get-conversations).
 */
export const EXPORT_CONVERSATIONS_PATH = '/api/v2/export/conversations'

/**
 * "`page_size` (integer, optional, default: 10000) — Number of records to
 * return in response. The maximum and default is 10000, the minimum is 100."
 */
export const EXPORT_PAGE_SIZE_MIN = 100
export const EXPORT_PAGE_SIZE_MAX = 10_000

/**
 * "Date range limitations: A query’s end date cannot be more than 60 days
 * after its start date." (https://docs.ada.cx/reference/data-export/overview)
 */
export const EXPORT_MAX_WINDOW_DAYS = 60

/**
 * "Historical data access: The Data Export API provides access to data from
 * the past 12 months." (https://docs.ada.cx/reference/data-export/overview)
 */
export const EXPORT_LOOKBACK_MONTHS = 12

/**
 * Conversations API, "GET https://example.ada.support/api/v2/conversations/{conversation_id}/"
 * (https://docs.ada.cx/reference/conversations/get-conversation-by-id).
 */
export const CONVERSATIONS_PATH = '/api/v2/conversations'

/**
 * "GET https://example.ada.support/api/v2/conversations/{conversation_id}/messages/"
 * "`limit` (integer, optional, default: 100) — Maximum number of messages to
 * return (default 100, max 100)"
 * (https://docs.ada.cx/reference/conversations/fetch-conversation-messages-by-id)
 */
export const CONVERSATION_MESSAGES_MAX_LIMIT = 100

/**
 * End Users API, "GET https://example.ada.support/api/v2/end-users/" and
 * "GET https://example.ada.support/api/v2/end-users/{end_user_id}"
 * (https://docs.ada.cx/reference/end-users/get-end-users,
 * https://docs.ada.cx/reference/end-users/get-end-user-by-id).
 */
export const END_USERS_PATH = '/api/v2/end-users'
