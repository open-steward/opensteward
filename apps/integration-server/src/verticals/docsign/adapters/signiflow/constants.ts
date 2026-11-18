/**
 * SigniFlow REST API constants.
 *
 * SigniFlow's "PowerFlow" OpenAPI is a JSON/REST service that manages the
 * initiation, monitoring, cancellation and removal of document signing
 * workflows.
 *
 * Authentication: POST /Login with UserNameField/PasswordField returns a
 * TokenField object (TokenField + TokenExpiryField) that is embedded in the
 * JSON body of every subsequent request. There is no auth header.
 *
 * The REST surface is served from the SigniFlow service host under
 * `/API/SignFlowAPIServiceRest.svc/`. SigniFlow is deployed both as a public
 * multi-tenant cloud and as customer-private installs, so the host is part of
 * the customer-supplied credentials; the constants below pin the public-cloud
 * default plus the pre-production sandbox.
 *
 * Docs: https://developers.signiflow.com/
 */

/** REST service path appended to the SigniFlow host. */
export const API_SERVICE_PATH = '/API/SignFlowAPIServiceRest.svc'

/** Public-cloud production host. */
export const DEFAULT_HOST = 'https://web1.signiflow.com'

/** Pre-production / sandbox host. */
export const SANDBOX_HOST = 'https://preprod.signiflow.com'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
