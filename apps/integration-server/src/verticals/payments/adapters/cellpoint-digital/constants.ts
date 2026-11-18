/**
 * CellPoint Digital — Velocity Payment Orchestration Platform (mPoint API).
 *
 * The Velocity API is served from CellPoint's mPoint infrastructure. CellPoint
 * provisions each merchant with a host during onboarding; the two standard
 * environments are a UAT/sandbox host and a production host. Both expose the
 * same `/mpoint/*` operation paths.
 *
 * Docs: https://documentation.cellpointdigital.com/docs/api
 *       https://documentation.cellpointdigital.com/docs/payment-operations
 */

/** Production mPoint host. */
export const PROD_BASE_URL = 'https://payment.cellpointmobile.net'

/** UAT / sandbox mPoint host. */
export const SANDBOX_BASE_URL = 'https://uat.cellpointmobile.net'

/** All Velocity operations live under the `/mpoint` path prefix. */
export const MPOINT_PREFIX = '/mpoint'

/** The Velocity core API speaks XML over HTTP. */
export const XML_CONTENT_TYPE = 'text/xml; charset=utf-8'

/** Velocity operation paths (relative to the mPoint prefix). */
export const PATHS = {
  initializePayment: `${MPOINT_PREFIX}/initialize-payment`,
  authorizePayment: `${MPOINT_PREFIX}/authorize-payment`,
  capturePayment: `${MPOINT_PREFIX}/capture-payment`,
  refund: `${MPOINT_PREFIX}/refund`,
  getTransactionStatus: `${MPOINT_PREFIX}/get-transaction-status`,
} as const

/**
 * Velocity status codes. The operation responses return a numeric `code`;
 * `1000` is the canonical "operation succeeded" code for capture/refund, and
 * transaction-level statuses use the codes below.
 */
export const STATUS_CODES = {
  /** Capture / refund operation succeeded. */
  operationSuccess: 1000,
  /** Payment authorized by the PSP. */
  authorized: 2000,
  /** Session complete (terminal success). */
  sessionComplete: 4030,
} as const
