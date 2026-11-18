/**
 * KORONA Cloud API v3 constants.
 *
 * Verified against the live spec at
 * https://128.koronacloud.com/web/api/v3/openapi.json (`info.title: "KORONA
 * Studio API v3"`, `servers[0].url: "https://128.koronacloud.com/web/api/v3"`)
 * and https://manual.koronapos.com/korona-cloud-api-v3/. `128` is one
 * cluster node example — the merchant's actual node is collected at connect
 * time (see `./connect-form.ts`).
 */
export const API_VERSION = 'v3'

/**
 * Every list endpoint documents `page` (int32) + `size` (int32) with no
 * documented maximum for `size` anywhere in the spec — unlike IdoSell's
 * explicit "1 to 100". No ceiling is declared here (no
 * `capabilities.maxPageSize`) because that would assert a limit this
 * adapter never verified; a request the platform actually rejects should
 * surface as a loud upstream 400, not a silently-guessed clamp.
 */
export const DEFAULT_PAGE_SIZE = 50

/** Hosts this adapter will connect to — confirmed suffix from the spec's `servers` block. */
export const CLOUD_HOST_SUFFIX = '.koronacloud.com'
