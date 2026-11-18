/**
 * DelightChat API constants.
 *
 * Base URL: https://api.delightchat.io
 * Auth: X-API-KEY header (API key from the DelightChat dashboard)
 * Docs: https://api.delightchat.io/docs
 *
 * DelightChat exposes a single public REST endpoint for sending WhatsApp
 * messages via automations. There are no published read-only endpoints for
 * tickets, contacts, users, tags, teams or macros; those resource methods
 * are therefore not implemented and will 501 automatically.
 */
export const API_BASE_URL = 'https://api.delightchat.io'
export const API_VERSION = 'v1'
export const DEFAULT_PAGE_SIZE = 50
