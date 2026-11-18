/**
 * Jushuitan (聚水潭) Open Platform API constants.
 *
 * Auth: app_key + app_secret + access_token.
 * Requests: POST form-encoded; business params are JSON-encoded in the `biz` field.
 * Signature: MD5(appSecret + ksort(params key+value pairs)).
 */
export const API_BASE_URL = 'https://openapi.jushuitan.com'
export const API_VERSION = '2'
export const API_CHARSET = 'utf-8'
export const DEFAULT_PAGE_SIZE = 50
