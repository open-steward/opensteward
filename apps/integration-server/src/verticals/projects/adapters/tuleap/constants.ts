/**
 * Tuleap REST API constants.
 *
 * Tuleap is self-hosted open-source ALM. The REST API lives at
 * `{instance}/api/` on the customer's own server.
 *
 * Auth: `X-Auth-AccessKey` header with a personal access key of the form
 * `tlp.k1.<base64-payload>`. Keys are generated at
 * `/profile/keys-tokens-svn`.
 *
 * Pagination: `limit` + `offset` query params. Total collection size is
 * returned in the `X-PAGINATION-SIZE` response header.
 *
 * Tuleap has no hosted SaaS URL. The instance base URL is supplied at
 * connection time and stored in `credentials.extra.host`.
 */

/** Public demo instance — individual installs supply their own host. */
export const DEFAULT_HOST = 'https://tuleap.net'

/** Prefix appended to the host to reach the REST API. */
export const API_PATH_PREFIX = '/api'

/** Link to the Tuleap personal-access-key documentation. */
export const API_KEY_HELP_URL =
  'https://docs.tuleap.com/user-guide/integration/rest/quick-start/auth.html'

/** Maximum items per page. Tuleap allows up to 1000 on some routes; use 100. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * `limit` ceiling of GET /projects and GET /artifacts/{id}/changesets: both
 * declare `"maximum": 50` (default 10) in https://tuleap.net/api/explorer/swagger.json.
 */
export const PROJECTS_MAX_LIMIT = 50
export const CHANGESETS_MAX_LIMIT = 50
