/**
 * iMile Express — Open API constants.
 *
 * Every value here is from iMile's public Open API catalog,
 * https://developer.imile.com (documents served at /apis/details/<id>).
 */

/**
 * Production host. "Introduction"
 * (https://developer.imile.com/apis/details/1825830683510648833) and "Access
 * Token" (https://developer.imile.com/apis/details/1825742952067575809) both
 * say "Production Environment: https://openapi.imile.com".
 *
 * No test host is offered: the two documents disagree on it ("Testing
 * Environment: https://test-openapi.52imile.cn" in Introduction,
 * "https://openapi.52imile.cn" in Access Token).
 */
export const IMILE_API_BASE = 'https://openapi.imile.com'

/** "Access Token": POST /auth/accessToken/grant, body `param.grantType` "clientCredential". */
export const IMILE_TOKEN_PATH = 'auth/accessToken/grant'
export const IMILE_GRANT_TYPE = 'clientCredential'

/**
 * Public envelope values, as the documents' request examples send them:
 * "format": "json", "version": "1.0.0", "signMethod": "MD5" (Introduction:
 * "Encryption,SHA256 or MD5").
 */
export const IMILE_FORMAT = 'json'
export const IMILE_VERSION = '1.0.0'
export const IMILE_SIGN_METHOD = 'MD5'

/**
 * Introduction: timeZone is "The caller's system time zone (+8/GMT+8),
 * (+4/GMT+4)" and timestamp "the current number of milliseconds in the
 * system, consistent with timeZone". The adapter sends Date.now(), an epoch
 * in UTC, so it declares UTC in the documented "+N" form.
 */
export const IMILE_TIME_ZONE = '+0'

/** "Order Track Query (Single)": POST /client/track/getOne. */
export const IMILE_TRACK_ONE_PATH = 'client/track/getOne'
/** getOne `orderType`: "1: Waybill number 2: Customer order number". */
export const IMILE_ORDER_TYPE_WAYBILL = '1'
/** getOne `language`: "1: Chinese 2: English 3: Spanish 4: Portuguese". */
export const IMILE_LANGUAGE_ENGLISH = '2'
