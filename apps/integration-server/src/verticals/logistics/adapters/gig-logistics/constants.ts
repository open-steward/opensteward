/**
 * GIG Logistics (GIGL) — constants
 *
 * GIG Logistics is Africa's leading logistics company, headquartered in Nigeria.
 * The REST API provides shipment creation, real-time tracking, rate enquiry,
 * and label generation across its domestic and international service network.
 *
 * Auth: API key passed as the `x-api-key` header.
 * Docs: https://giglogistics.com/developer/
 */

export const GIG_API_BASE = 'https://api.giglogistics.com/api/'

/** URL users visit to obtain an API key from their GIGL account. */
export const GIG_DASHBOARD_URL = 'https://giglogistics.com/developer/'

/** Default currency for Nigerian domestic shipments. */
export const GIG_DEFAULT_CURRENCY = 'NGN'

/** GIG Logistics operates primarily within Nigeria and West Africa. */
export const GIG_DEFAULT_COUNTRY = 'NG'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
