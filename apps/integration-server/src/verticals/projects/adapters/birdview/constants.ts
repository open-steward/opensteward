/**
 * Birdview PSA REST API v2 — constants.
 *
 * Every value here is quoted from Birdview's own documentation:
 *
 * - Host. "How to use the Birdview API with Swagger and Postman"
 *   (https://help.birdviewpsa.com/hc/en-us/articles/38116720932749) pages tasks
 *   with `GET https://{{host}}.go.easyprojects.net/api/v2/tasks?ProjectId=...`,
 *   so the API lives on the customer's own subdomain.
 * - Token URL. The same article: "POST [host]/OAuth2/token ...
 *   grant_type=client_credentials&client_id=[clientID]&scope=user:[user]&client_secret=[clientSecret]".
 * - Paths, parameters and response shapes: the OpenAPI 3.0 document the
 *   Swagger UI serves, https://app.go.easyprojects.net/api/swagger/v2/swagger.json.
 */

/** One DNS label: letters, digits and inner hyphens, at most 63 characters. */
const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

/**
 * Build the per-tenant API origin from the account slug (`acme` →
 * acme.go.easyprojects.net). The slug must be a single DNS label: anything
 * else (a dot, `#`, `/`, `@`, ...) could move the request, and with it the
 * client secret or bearer token, to another host, so it is refused.
 */
export function apiOrigin(account: string): string {
  if (!DNS_LABEL.test(account)) {
    throw Object.assign(
      new Error(
        `Birdview PSA account slug ${JSON.stringify(account)} is not a single subdomain label (for https://acme.go.easyprojects.net it is "acme").`,
      ),
      { statusCode: 400, code: 'INVALID_ACCOUNT' },
    )
  }
  return `https://${account}.go.easyprojects.net`
}

/** Build the per-tenant OAuth2 token URL from the account slug. */
export function oauthTokenUrl(account: string): string {
  return `${apiOrigin(account)}/OAuth2/token`
}

/** Where users find the API / OAuth client setup instructions. */
export const TOKEN_HELP_URL =
  'https://help.birdviewpsa.com/hc/en-us/articles/38116720932749-How-to-use-the-Birdview-API-with-Swagger-and-Postman'

/**
 * The largest `Take` a list request sends.
 *
 * The help article above: "By default, the number of returned items requested
 * by a GET query is limited to 100. To get a complete list of items you need to
 * use pagination. With Take=100 ... Skip = (pageNumber - 1) * Take ... until the
 * response returns fewer than 100 items (signaling the last page)." No larger
 * Take is documented, and a silently capped page would read as the last one, so
 * a request never asks for more than 100 and reports the size it sent.
 */
export const MAX_TAKE = 100
