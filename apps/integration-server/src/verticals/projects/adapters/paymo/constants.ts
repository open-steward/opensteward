/**
 * Paymo REST API.
 *
 * Single-tenant cloud SaaS: every company shares one base host
 * (`https://app.paymoapp.com/api`). There is no separate sandbox host — Paymo
 * runs a single production environment, so callers test against their own
 * account data.
 *
 * Authentication is HTTP Basic with the API key as the username and any
 * non-empty string as the password. The key is collected on the Connect Link
 * form (`simpleApiKey`) and stored as `credentials.accessToken`; the client
 * base64-encodes `apiKey:x` into the `Authorization: Basic …` header.
 *
 * Collections return a JSON object keyed by the plural resource name
 * (`{ "projects": [...] }`). Paymo does not page list responses — the whole
 * collection comes back — but it supports server-side filtering via the
 * `where` query parameter (e.g. `where=project_id=123`).
 */
export const API_BASE_URL = 'https://app.paymoapp.com/api'

/** Where a user generates an API key (My Account → Integrations / API Keys). */
export const API_KEY_HELP_URL =
  'https://github.com/paymo-org/api/blob/master/sections/authentication.md'

/**
 * Password sent alongside the API key for HTTP Basic auth. Paymo ignores the
 * password when the username is an API key, so any non-empty placeholder works.
 */
export const API_KEY_BASIC_PASSWORD = 'x'

/** Header carrying the HMAC-SHA1 signature (`sha1=…`) on each webhook delivery. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-paymo-signature'

/** Header carrying the `model.[action].[Object]` event name on each delivery. */
export const WEBHOOK_EVENT_HEADER = 'x-paymo-event'

/** Paymo returns full collections in one response (no pagination cursor). */
export const DEFAULT_PAGE_SIZE = 100
