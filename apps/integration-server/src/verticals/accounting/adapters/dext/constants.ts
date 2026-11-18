/**
 * Dext Precision API constants.
 *
 * Dext Precision (formerly Receipt Bank) exposes a REST API for practice
 * management data: client health scores, VAT details, bank reconciliation
 * status, and activity statistics.
 *
 * Docs: https://help.dext.com/en/articles/272702-data-health-insights-api
 */

export const DEXT_API_BASE = 'https://api.precision.dext.com'
export const DEXT_CONNECT_PAGE = 'https://app.precision.dext.com/settings/api-tokens'

/** Rate limit: 60 requests per minute */
export const RATE_LIMIT_RPM = 60

export const DEFAULT_PAGE_SIZE = 100
