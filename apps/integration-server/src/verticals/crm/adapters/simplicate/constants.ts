/**
 * Simplicate API v2 constants.
 *
 * Base URL pattern: https://{subdomain}.simplicate.nl/api/v2
 * The subdomain is the customer's Simplicate environment name.
 *
 * Docs: https://developer.simplicate.com/docs/api/v2/getting_started/
 */

/** Maximum records per page. Simplicate default is 100; we use 100. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Documented page ceiling: "You can't exceed 100 records per page on almost
 * all endpoints." (https://developer.simplicate.com/docs/api/v2/filtering)
 */
export const MAX_PAGE_SIZE = 100

/** Path prefix for all CRM endpoints. */
export const CRM_PATH = '/crm'

/** Path prefix for all Sales endpoints. */
export const SALES_PATH = '/sales'
