/**
 * CCAvenue Merchant API (v1.2) constants.
 *
 * CCAvenue (Avenues India Pvt. Ltd.) is India's largest payment aggregator.
 * Server-to-server calls all hit a single `DoWebTrans` servlet; the actual
 * operation is selected by the `command` POST field. Each request body is
 * AES-128-CBC encrypted with the merchant's Working/Encryption Key and posted
 * as the `enc_request` form field.
 *
 * Docs: Merchant's API v1.2 Implementation Guide (DoWebTrans servlet).
 */

/** DoWebTrans servlet hosts — selected by the `environment` credential. */
export const PRODUCTION_API_BASE_URL = 'https://api.ccavenue.com'
export const STAGING_API_BASE_URL = 'https://apitest.ccavenue.com'

/** Every Merchant-API command is POSTed to this single servlet path. */
export const DO_WEB_TRANS_PATH = '/apis/servlet/DoWebTrans'

/** API version pinned for deterministic transforms. */
export const API_VERSION = '1.2'

/** Wire format CCAvenue speaks for request/response bodies. */
export const REQUEST_TYPE = 'JSON'
export const RESPONSE_TYPE = 'JSON'

/** `command` values understood by DoWebTrans (only those we implement). */
export const COMMAND_ORDER_STATUS = 'orderStatusTracker'
export const COMMAND_REFUND = 'refundOrder'
export const COMMAND_CANCEL = 'cancelOrder'

export const DEFAULT_PAGE_SIZE = 50
