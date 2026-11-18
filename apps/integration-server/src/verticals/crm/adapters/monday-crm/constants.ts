export const MONDAY_API_URL = 'https://api.monday.com/v2'
export const MONDAY_AUTH_URL = 'https://auth.monday.com/oauth2/authorize'
export const MONDAY_TOKEN_URL = 'https://auth.monday.com/oauth2/token'

/** Default page size for items_page queries. */
export const DEFAULT_LIMIT = 25

/** items_page / next_items_page: "The default is 25, but the maximum is 500." */
export const MAX_PAGE_SIZE = 500

/**
 * Standard column IDs used in Monday CRM board templates.
 * These are the defaults from Monday's CRM template; real boards may differ
 * but these are the most common.
 */
export const COLUMN_IDS = {
  EMAIL: 'email',
  PHONE: 'phone',
  /** Title/job title on Contacts board. */
  STATUS: 'status',
  /** Domain/website on Companies board. */
  LINK: 'link',
  /** Deal value on Deals board. */
  NUMBERS: 'numbers',
  /** Stage on Deals board. */
  DEAL_STATUS: 'status',
  /** Close date on Deals board. */
  DATE: 'date',
  /** Owner on Deals board. */
  PEOPLE: 'people',
} as const
