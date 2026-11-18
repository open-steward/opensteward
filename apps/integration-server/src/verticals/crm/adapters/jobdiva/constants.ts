/**
 * JobDiva API constants.
 *
 * JobDiva is a staffing/recruiting ATS whose REST API (apiv2) covers
 * candidates, client companies, client contacts, jobs, notes, and
 * submittal/activity records.
 *
 * Docs: https://api.jobdiva.com/jobdiva-api.html
 */

/** Base URL for all JobDiva API v2 calls. */
export const BASE_URL = 'https://api.jobdiva.com/apiv2/jobdiva'

/** Token endpoint — POST username + password + clientId → Bearer token. */
export const TOKEN_PATH = '/gettoken'

/** Default page size for paginated list endpoints. */
export const DEFAULT_PAGE_SIZE = 25
