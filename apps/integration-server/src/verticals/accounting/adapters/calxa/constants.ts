/**
 * Calxa API constants.
 *
 * Calxa is a financial reporting and budgeting platform for businesses and
 * not-for-profits. It exposes a REST API that accepts an API key via the
 * `X-Api-Key` request header.
 *
 * Base URL: https://app.calxa.com/api/v1
 */

export const CALXA_API_BASE = 'https://app.calxa.com/api/v1'

// Calxa does not publish a rate limit in its docs; apply a conservative cap.
export const RATE_LIMIT_RPM = 60
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
