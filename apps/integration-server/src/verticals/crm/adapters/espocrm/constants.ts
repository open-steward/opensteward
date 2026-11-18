/** Page size for a direct call that names no limit (the router always sends one). */
export const DEFAULT_PAGE_SIZE = 25

/**
 * https://docs.espocrm.com/api/spec.json, every list operation:
 * `maxSize` — {"type":"integer","minimum":0,"maximum":200},
 * "The maximum number of records to return."
 */
export const MAX_PAGE_SIZE = 200
