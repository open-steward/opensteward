/**
 * Stitch Money API constants.
 *
 * Stitch's API is GraphQL: a POST of a query document to one URL. "The GraphQL
 * API URL https://api.stitch.money/graphql can be used for all disbursement
 * requests (whether on test or live clients)."
 * (https://docs.stitch.money/payment-products/payouts/disbursements)
 *
 * The merchant-level reads (client.paymentInitiationRequests,
 * client.disbursements) need a CLIENT token. "Stitch uses the OAuth 2.0 Client
 * Credentials Flow for client tokens. This flow entails making a POST request
 * to the https://secure.stitch.money/connect/token endpoint."
 * (https://docs.stitch.money/authentication/client-tokens)
 */

export const API_BASE_URL = 'https://api.stitch.money/graphql'
export const OAUTH_TOKEN_URL = 'https://secure.stitch.money/connect/token'
/** "audience: Should always be the value https://secure.stitch.money/connect/token" */
export const TOKEN_AUDIENCE = 'https://secure.stitch.money/connect/token'

/**
 * Client scopes, from https://docs.stitch.money/authentication/client-tokens:
 * "client_paymentrequest This scope is required to create, view and manage Pay
 * By Bank payment requests." and "client_disbursement This scope allows you to
 * issue a disbursement". Client.disbursements: "This field requires the
 * following scope: [client_disbursement]" (https://docs.stitch.money/api/objects/client).
 */
export const CLIENT_SCOPES = ['client_paymentrequest', 'client_disbursement']

/**
 * Client.paymentInitiationRequests: "The first parameter can be used to set the
 * number of payment requests to return, up to a maximum of 2000 payment
 * requests." (https://docs.stitch.money/api/objects/client).
 */
export const MAX_PAGE_SIZE = 2000
/**
 * Client.disbursements documents no maximum `first` (its args carry only
 * "Specifies the maximum number of results to return"), so the only size the
 * docs guarantee is the default: "The default page size for collections is 500"
 * (https://docs.stitch.money/graphql/pagination). A larger ask is clamped to it
 * and the size sent is reported.
 */
export const DISBURSEMENTS_MAX_FIRST = 500
export const DEFAULT_PAGE_SIZE = 50
