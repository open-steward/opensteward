/**
 * Eudonet EudoAPI constants.
 *
 * Base URL pattern: https://<instance>.eudonet.com/EudoAPI/
 * The instance subdomain is supplied by the customer at credential time
 * and stored in credentials.extra.instanceUrl.
 *
 * Table DescIds follow Eudonet's convention: tables are multiples of 100,
 * fields are table_id + sequential offset.
 *
 * Ref: http://demo.eudonet.com/eudoapi/eudoapidoc/swaggerui/
 */

/** Default base URL (used when no instance URL is stored on credentials). */
export const DEFAULT_BASE_URL = 'https://my.eudonet.com/EudoAPI'

/** Number of records per page when no limit is specified. */
export const DEFAULT_PAGE_SIZE = 25

// ── Table DescIds ─────────────────────────────────────────────────────────────

/** Contacts table — Tab 200. */
export const TAB_CONTACTS = 200

/** Companies / Accounts table — Tab 100. */
export const TAB_COMPANIES = 100

/** Opportunities / Deals table — Tab 300. */
export const TAB_DEALS = 300

/** Notes table — Tab 500. */
export const TAB_NOTES = 500

// ── Contact field DescIds (table 200) ────────────────────────────────────────

export const FIELD_CONTACT_LASTNAME   = 201
export const FIELD_CONTACT_FIRSTNAME  = 202
export const FIELD_CONTACT_EMAIL      = 203
export const FIELD_CONTACT_PHONE      = 204
export const FIELD_CONTACT_MOBILE     = 205
export const FIELD_CONTACT_TITLE      = 206
export const FIELD_CONTACT_COMPANY_ID = 207
export const FIELD_CONTACT_CREATED_AT = 290
export const FIELD_CONTACT_UPDATED_AT = 291

// ── Company field DescIds (table 100) ────────────────────────────────────────

export const FIELD_COMPANY_NAME       = 101
export const FIELD_COMPANY_DOMAIN     = 102
export const FIELD_COMPANY_PHONE      = 103
export const FIELD_COMPANY_INDUSTRY   = 104
export const FIELD_COMPANY_SIZE       = 105
export const FIELD_COMPANY_CREATED_AT = 190
export const FIELD_COMPANY_UPDATED_AT = 191

// ── Deal field DescIds (table 300) ───────────────────────────────────────────

export const FIELD_DEAL_TITLE      = 301
export const FIELD_DEAL_STATUS     = 302
export const FIELD_DEAL_STAGE      = 303
export const FIELD_DEAL_AMOUNT     = 304
export const FIELD_DEAL_CURRENCY   = 305
export const FIELD_DEAL_COMPANY_ID = 306
export const FIELD_DEAL_CLOSE_DATE = 307
export const FIELD_DEAL_CREATED_AT = 390
export const FIELD_DEAL_UPDATED_AT = 391

// ── Note field DescIds (table 500) ───────────────────────────────────────────

export const FIELD_NOTE_CONTENT    = 501
export const FIELD_NOTE_CONTACT_ID = 502
export const FIELD_NOTE_COMPANY_ID = 503
export const FIELD_NOTE_DEAL_ID    = 504
export const FIELD_NOTE_CREATED_AT = 590
export const FIELD_NOTE_UPDATED_AT = 591
