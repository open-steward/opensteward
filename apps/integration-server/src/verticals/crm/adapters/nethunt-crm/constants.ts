/**
 * NetHunt Public REST API host. The OpenAPI document at
 * https://nethunt.com/api/openapi.json declares `"servers": []` and paths
 * under `/api/v2/...`; with no servers an OpenAPI path resolves against the
 * host that serves the document, https://nethunt.com.
 */
export const BASE_URL = 'https://nethunt.com'

/**
 * `limit` on POST /api/v2/folders/{folderId}/records/filter and on
 * GET .../records/{recordId}/timeline:
 * "schema":{"type":"integer","minimum":1,"maximum":1000,"default":100}.
 */
export const MAX_PAGE_SIZE = 1000

/**
 * Parent records fetched per upstream page when flattening comments out of
 * record timelines (listNotes). The filter endpoint's documented default.
 */
export const NOTE_PARENT_PAGE_SIZE = 100
