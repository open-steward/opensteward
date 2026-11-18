/**
 * SignRequest REST API constants.
 *
 * SignRequest exposes a single REST API host. Authentication is a static
 * per-account API token sent as `Authorization: Token <token>`, so there
 * is no OAuth authorize/token endpoint. A separate `sandbox` flag on each
 * Document distinguishes test traffic from production — the API host is the
 * same for both. Team-scoped tokens may also be issued under a team
 * subdomain (`https://<team>.signrequest.com/api/v1`); the central host
 * below works for personal and team tokens alike.
 *
 * List endpoints are DRF-paginated: responses carry `count` / `next` /
 * `previous` / `results`, driven by `page` + `limit` query params.
 *
 * Docs: https://signrequest.com/api/v1/docs/
 */
export const API_BASE_URL = 'https://signrequest.com/api/v1'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/** Header name carrying the HMAC-SHA256 signature on webhook deliveries. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-signrequest-signature'
