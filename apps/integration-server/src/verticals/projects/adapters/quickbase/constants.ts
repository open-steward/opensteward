// Quickbase REST API — single global host. There is no separate sandbox
// host; the customer's realm is supplied per request via the
// QB-Realm-Hostname header (e.g. `acme.quickbase.com`).
// Docs: https://developer.quickbase.com/
export const API_BASE_URL = 'https://api.quickbase.com/v1'

// Records are paged via options.skip / options.top on POST /records/query.
export const DEFAULT_PAGE_SIZE = 100

// Requests one listTasks call may make to fill a caller page when Quickbase's
// intelligent pagination returns fewer records than `top` asked for.
export const MAX_FILL_REQUESTS = 50

// Quickbase built-in field ids, present on every table. Records returned by
// /records/query key each field by its numeric id, so the canonical task
// transform reads these well-known positions directly.
// Docs: https://help.quickbase.com/docs/find-field-record-ids-and-table-aliases
export const FID_DATE_CREATED = 1
export const FID_DATE_MODIFIED = 2
export const FID_RECORD_ID = 3
export const FID_RECORD_OWNER = 4
export const FID_LAST_MODIFIED_BY = 5
