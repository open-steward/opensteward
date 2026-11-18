/**
 * Lightspeed Retail (R-Series) API constants.
 *
 * R-Series is the legacy/dominant Lightspeed POS. Base URL requires the
 * account ID in every path. Access tokens expire in ~30 minutes — the
 * most aggressive refresh cadence in the project.
 */

export const BASE_URL = 'https://api.lightspeedapp.com/API/V3/Account'

/** OAuth token endpoint for R-Series. */
export const TOKEN_URL = 'https://cloud.lightspeedapp.com/oauth/access_token.php'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
