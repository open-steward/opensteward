/**
 * Webgility Connect REST API constants.
 *
 * Auth: appKey + appSecret exchanged for an AccessToken via POST /appusers.
 * The AccessToken is then sent as a Bearer token on every subsequent request.
 *
 * Ref: https://github.com/webgility/connect-v1.0/wiki
 */
export const API_BASE_URL = 'https://api.connect.webgility.com/v1'
export const DEFAULT_PAGE_SIZE = 100
