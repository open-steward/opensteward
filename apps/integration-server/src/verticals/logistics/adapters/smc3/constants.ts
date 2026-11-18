/**
 * SMC3 CarrierConnect XL (CCXL) and RateWare XL (RWXL) constants.
 *
 * SMC3 provides two distinct REST APIs for LTL freight intelligence:
 *   - CarrierConnect XL (CCXL): transit times, terminal lookups, carrier services
 *   - RateWare XL (RWXL): LTL freight rate quoting
 *
 * Authentication uses three HTTP request headers:
 *   licenseKey, username, password
 *
 * Production base URLs (customer-provisioned; trial URLs used for dev):
 *   CCXL: https://ccxl.smc3.com/CarrierConnectXL/services/rest/v3
 *   RWXL: https://applications.smc3.com/RateWareXL/services/rest/v2
 */

export const SMC3_CCXL_API_BASE = 'https://ccxl.smc3.com/CarrierConnectXL/services/rest/v3'

export const SMC3_RWXL_API_BASE = 'https://applications.smc3.com/RateWareXL/services/rest/v2'

export const SMC3_CCXL_API_VERSION = 'V3_2'

export const SMC3_DASHBOARD_URL = 'https://www.smc3.com/ltl-api.htm'

/**
 * Token separator used when encoding credentials as a single accessToken string.
 * Format: "<username>|<password>|<licenseKey>"
 */
export const CREDENTIAL_SEPARATOR = '|'
