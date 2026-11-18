/**
 * Agiloft REST API constants.
 *
 * Agiloft is a per-tenant CLM platform. Its REST operations live under
 * `https://{host}/ewws/{operation}`, where `{host}` is the customer's Agiloft
 * server (e.g. `acme.agiloft.com`, or a self-hosted server) and the knowledge
 * base is named by the `$KB` parameter — both are required. Neither is known
 * to the deployment: they are collected per connection (`oauthFields`) and
 * carried on `credentials.extra` so the client and the refresh flow can
 * rebuild the per-tenant URLs.
 *
 * Auth is OAuth2 Authorization-Code Grant; the authorize/token endpoints
 * (`/ewws/oauth`, `/ewws/otoken`) live on the same per-tenant host. The
 * access token is sent as `Authorization: Bearer <token>`.
 *
 * Docs: https://help.agiloft.com/space/HELP/43715778/REST+Interface
 *       https://help.agiloft.com/space/HELP/43716464/Using+OAuth2+to+Access+REST+API
 */

/**
 * Operation path prefix: "/ewws/{operation}?$KB={kbName}&$table={table}&…"
 * (REST Interface, "GET/POST" URL convention).
 */
export const EWWS_PATH = '/ewws'

/**
 * The language every call names. The Login doc gives "$lang - URL-encoded
 * language; by default - en", and a call without it is refused ("One has to
 * specify $table, $KB, $lang parameters").
 */
export const LANG = 'en'

/** OAuth2 endpoint paths, relative to `https://{host}`. */
export const OAUTH_AUTHORIZE_PATH = '/ewws/oauth'
export const OAUTH_TOKEN_PATH = '/ewws/otoken'

/**
 * Logical name of the Contracts table: "Retrieve a list of saved searches for
 * the Contract table, using its logical name of `contract`." (REST - Saved
 * Search, https://help.agiloft.com/space/HELP/43714188)
 */
export const CONTRACTS_TABLE = 'contract'

/**
 * Logical name of the Contract Title field, as the documented contract Search
 * reply names it: `"contract_title1":"MASTER SERVICES AGREEMENT"` (REST -
 * NLPSearch, https://help.agiloft.com/space/HELP/119799848, which "returns
 * records in the same format as REST - Search").
 */
export const CONTRACT_TITLE_FIELD = 'contract_title1'

/**
 * Page size when the caller names none. Search documents no maximum, only
 * that "A page size limit value of zero indicates "all records"", so a limit
 * is always sent and never 0.
 */
export const DEFAULT_PAGE_SIZE = 100

/** Default OAuth2 scopes requested for read access to the REST interface. */
export const DEFAULT_SCOPES = ['read']
