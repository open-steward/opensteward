/**
 * SalesNexus API constants.
 *
 * All API calls are HTTP POST to the single base URL with a JSON array body.
 * Authentication is via a `login-token` field embedded in each function's
 * parameters object (not an HTTP header).
 *
 * Docs: https://logon.salesnexus.com/api/docs/api-v1
 */

/** Single endpoint for all SalesNexus API v1 calls (production). */
export const SALESNEXUS_BASE_URL = 'https://logon.salesnexus.com/api/call-v1'

/** Default page size for list operations. SalesNexus max is 1000 per call. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Well-known contact field IDs used in SalesNexus.
 *
 * SalesNexus uses numeric field IDs for all contact fields.
 * These are the standard/default field IDs present in all accounts.
 * Custom fields have account-specific IDs discoverable via get-all-fields.
 */
export const CONTACT_FIELDS = {
  FULL_NAME: '48',
  COMPANY: '47',
  EMAIL: '133',
  PHONE: '51',
  MOBILE: '52',
  TITLE: '53',
  FIRST_NAME: '49',
  LAST_NAME: '50',
  ADDRESS1: '55',
  ADDRESS2: '56',
  CITY: '57',
  STATE: '58',
  ZIP: '59',
  COUNTRY: '60',
  OWNER_ID: '100',
  CREATED_DATE: '101',
  MODIFIED_DATE: '102',
} as const

/**
 * Well-known sales opportunity field IDs.
 * Field 218 = sales opportunity's own record ID (used in match-by-field-data to target a specific record).
 * Field 220 = linked contact ID, 221 = title, 222 = status (0=open,1=won,2=lost),
 * 225 = amount (major currency units), 226 = close date, 229 = owner ID,
 * 231 = details/description, 234 = sales stage.
 */
export const SALES_FIELDS = {
  SALES_ID: '218',
  CONTACT_ID: '220',
  DETAILS: '231',
  STATUS: '222',
  STAGE: '234',
  AMOUNT: '225',
  CLOSE_DATE: '226',
  TITLE: '221',
  OWNER_ID: '229',
} as const
