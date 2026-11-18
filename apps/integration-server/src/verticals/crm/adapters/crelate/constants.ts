/**
 * Crelate API constants.
 *
 * READS use Crelate API v3, from its OpenAPI document
 * https://app.crelate.com/api3/docs/v3/crelate-openapi.json:
 *
 *   servers: [{ "url": "https://app.crelate.com/api3" }]
 *   "When making HTTP requests, include the API key using the header name `X-Api-Key`."
 *   Pagination: "| limit | number | 50 | Maximum number of records to retrieve. (Maximum of 100) |"
 *
 * WRITES (create/update/delete, createNote, createActivity) still target the
 * retired public v1 API, which answers every path with HTTP 410: "As previously
 * announced for over 2 years, Public API v1 and v2 has been disabled. Please
 * upgrade to Public API v3 ...". They are out of scope of the read rebuild and
 * are kept on v1 deliberately: moving their v1-shaped bodies onto v3 unchanged
 * could create empty records instead of failing.
 */

/** Crelate API v3 base URL (the spec's only server). */
export const BASE_URL = 'https://app.crelate.com/api3'

/** Documented: "(Maximum of 100)". */
export const MAX_PAGE_SIZE = 100

/** Documented default `limit`: "| limit | number | 50 |". */
export const DEFAULT_PAGE_SIZE = 50

/**
 * The sort every list request sends. The docs (Sorting section; the spec
 * breaks the line after "Without"): "Setting a `sort_by` is highly recommended
 * whenever you use `offset`. Without
 * an explicit sort, page boundaries are not guaranteed to be stable between
 * requests." The default is documented in two places: the global Sorting
 * table, "|sort_by | string array | `modifiedOn desc` | Comma separated sort
 * options.", which covers every list used here including /jobs; and the
 * /contacts, /companies and /workflowstatuses descriptions, "If no sort_by is
 * provided, the resulting list will be sorted by ModifiedOn descending" (the
 * /jobs description does not repeat it). So this is the documented default,
 * made explicit.
 */
export const LIST_SORT = 'ModifiedOn desc'

/**
 * Crelate's workflow types. v3 has no endpoint that lists them; GET
 * /workflowstatuses documents the complete set in its `workflow_type_ids`
 * parameter: "The Workflow type to limit results to.Possible values are:
 * * Recruiting = `F6EF012F-998D-4132-B38B-A17A00B2B958` * EmploymentSearch =
 * `07DF70FE-C56E-4EC5-B656-A22000D149EF` * Sales =
 * `56544447-B7A1-40D9-BAAF-A6B000FACCC7` * BusinessDevelopment =
 * `0027E210-1E59-4715-A19C-B13B00EB4FB0`".
 */
export const WORKFLOW_TYPES: ReadonlyArray<{ readonly Id: string; readonly Name: string }> = [
  { Id: 'F6EF012F-998D-4132-B38B-A17A00B2B958', Name: 'Recruiting' },
  { Id: '07DF70FE-C56E-4EC5-B656-A22000D149EF', Name: 'EmploymentSearch' },
  { Id: '56544447-B7A1-40D9-BAAF-A6B000FACCC7', Name: 'Sales' },
  { Id: '0027E210-1E59-4715-A19C-B13B00EB4FB0', Name: 'BusinessDevelopment' },
]

/** Retired public v1 API — used only by the out-of-scope write methods. */
export const LEGACY_V1_BASE_URL = 'https://app.crelate.com/api/pub/v1'
