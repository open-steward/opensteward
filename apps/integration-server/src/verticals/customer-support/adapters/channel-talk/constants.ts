/**
 * Channel Talk (channel.io) Open API constants.
 *
 * Base URL: https://api.channel.io
 * Auth:     x-access-key + x-access-secret headers
 * Docs:     https://developers.channel.io/docs/authentication-2
 *
 * Versioning: the current OpenAPI spec (fetched 2026-09-13 from
 * https://api-doc.channel.io/docs/openapi.en.yaml, which redirects to
 * api-doc.channel.works) serves every resource off the unversioned `/open/*`
 * prefix and selects a version via the `Channel-Version: YYYY-MM-DD` request
 * header (component `channelVersion`), not a path segment. There is no
 * `/open/teams` path anywhere in that spec — only `UserChat.teamId`, a
 * routing field, not a listable Team entity.
 *
 * The old `/open/v4` and `/open/v5` path prefixes this adapter used to send
 * are a separate legacy stack still served behind auth (401, not 404, when
 * unauthenticated — confirmed live 2026-09-13), so they are not simply gone,
 * but no route on them is authoritative any more and `/open/v5/teams` /
 * `/open/v4/teams` both 404 at routing on that stack too — the resource
 * never existed on either stack. Do not reintroduce a versioned prefix here;
 * use API_PREFIX with the CHANNEL_API_VERSION header in client.ts instead.
 */

/** REST base URL — no trailing slash */
export const API_BASE_URL = 'https://api.channel.io'

/** Unversioned Open API prefix — see the versioning note above. */
export const API_PREFIX = '/open'

/** Pinned `Channel-Version` header value; bump deliberately, not silently. */
export const CHANNEL_API_VERSION = '2026-06-01'

/** Page size sent when the caller gives no limit. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Largest `limit` the list endpoints accept. The OpenAPI spec's shared
 * `limit` parameter (components.parameters.limit): "Maximum number of items
 * to return", `minimum: 1`, `maximum: 500`, `default: 25`. Paging is by
 * `cursor` ("Opaque cursor from previous response for pagination"), and the
 * response carries `nextCursor` ("Opaque cursor for the next page. Null if no
 * more pages.") and `hasNext`.
 */
export const MAX_PAGE_SIZE = 500
