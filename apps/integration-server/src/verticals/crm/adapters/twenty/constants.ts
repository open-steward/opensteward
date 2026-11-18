/**
 * "| Cloud | `https://api.twenty.com/` |" and "| Self-Hosted | `https://{your-domain}/` |"
 * (https://docs.twenty.com/developers/extend/api.md).
 */
export const DEFAULT_INSTANCE_URL = 'https://api.twenty.com'

/**
 * "**Core API** — `/rest/` and `/graphql/`" (https://docs.twenty.com/developers/extend/api.md);
 * the Core OpenAPI's server is "https://api.twenty.com/rest/"
 * (https://api.twenty.com/open-api/core).
 */
export const REST_PREFIX = '/rest'

/** "Use **limit** to cap page size (default: 60, max: 200)." (https://api.twenty.com/open-api/core) */
export const MAX_PAGE_SIZE = 200
