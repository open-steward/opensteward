/**
 * Openbravo ERP JSON REST Web Services constants.
 *
 * Auth: HTTP Basic (username + password). The host is customer-configured
 * (on-premise or Openbravo Cloud). The JSON REST servlet lives at
 * /openbravo/org.openbravo.service.json.jsonrest/{EntityName}
 *
 * Pagination: _startRow (0-based) / _endRow (exclusive), default page 100 rows.
 */

/** Placeholder context path — the actual base is supplied per-credential as `host`. */
export const JSON_REST_PATH = '/openbravo/org.openbravo.service.json.jsonrest'

/** Default page window sent in every list call. */
export const DEFAULT_PAGE_SIZE = 100
