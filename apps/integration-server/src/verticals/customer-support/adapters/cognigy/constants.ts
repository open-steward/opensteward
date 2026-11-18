/**
 * Cognigy Live Agent REST API constants.
 *
 * Cognigy Live Agent is built on Chatwoot. All resource endpoints are
 * account-scoped: /api/v1/accounts/{account_id}/...
 *
 * Base URL is per-tenant (environment-specific). The tenant configures their
 * own liveagent host via credentials.extra.baseUrl; the trial URL is the
 * fallback shown in the credential helper text.
 *
 * Auth: api_access_token header (user API key from Profile Settings).
 * Pagination: page query param (1-indexed, page size = 15 for contacts; 25
 * for conversations). Messages use cursor (after/before by message ID).
 */

export const DEFAULT_BASE_URL = 'https://liveagent-trial.cognigy.ai'
export const API_V1 = '/api/v1/accounts'
export const DEFAULT_PAGE_SIZE = 25
/** Contacts come back in pages of exactly this many rows ("Page size = 15"). */
export const CONTACTS_PAGE_SIZE = 15
