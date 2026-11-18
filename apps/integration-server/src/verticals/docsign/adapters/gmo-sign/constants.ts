/**
 * GMO Sign REST API constants.
 *
 * GMO Sign (GMO GlobalSign Holdings) exposes an "agree-api" REST surface.
 * Every request is a POST whose JSON body carries the three credentials —
 * `cus_id` (Customer ID), `secret_key`, and a short-lived `access_token`
 * minted from `/accesstoken/generate`. There is no OAuth Authorization-Code
 * flow; the credentials are issued by GMO Sign sales/support when the API
 * plan is enabled.
 *
 * The API host (`accessUrl`) is account-specific and supplied alongside the
 * credentials, so the credential form collects it and the client reads it
 * from `credentials.extra.accessUrl`. The default below is the public
 * production host.
 *
 * Docs:
 *   https://helpcenter.gmosign.com/
 *   https://learn.microsoft.com/en-us/connectors/gmosign/
 */

/** API version segment of the agree-api path. */
export const API_VERSION = 'v0'

/** Path prefix for every resource: `/agree-api/${API_VERSION}/api`. */
export const API_PREFIX = `/agree-api/${API_VERSION}/api`

/**
 * Default API host. GMO Sign issues an account-specific `accessUrl`; the
 * credential form captures it and the client prefers `credentials.extra.accessUrl`.
 */
export const DEFAULT_ACCESS_URL = 'secure.gmosign.com'

/** Mint a short-lived access token from `cus_id` + `secret_key`. */
export const ACCESS_TOKEN_PATH = `${API_PREFIX}/accesstoken/generate`

/** Retrieve an envelope (status, documents, signers) by `envelope_xid`. */
export const ENVELOPE_STATUS_PATH = `${API_PREFIX}/envelope/status`

/** Success marker on every response body's `status` field. */
export const STATUS_OK = '0'
