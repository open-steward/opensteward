// AbraFlexi is a self-hosted REST API. The URL pattern is:
// https://<server>/c/<company>/
// This default points to the public demo instance. Production users override with their server URL.
export const ABRAFLEXI_API_BASE = 'https://demo.abraflexi.eu/c/demo'
// AbraFlexi uses HTTP Basic Authentication (username + password) — there is no OAuth flow.
// Users configure their server URL, username, and password directly.
export const ABRAFLEXI_SETTINGS_URL = 'https://demo.abraflexi.eu'

// AbraFlexi paginates with 'start' (offset) and 'limit' parameters
// (https://podpora.flexibee.eu/en/articles/4722193-pagination). 50 is this
// adapter's own default for a call without a limit; AbraFlexi's is 20.
export const DEFAULT_PAGE_SIZE = 50
// NOT an AbraFlexi limit: no maximum for `limit` is documented, and the
// vendor's demo serves 1,000-row pages. Only the legacy pagination() behind
// listCreditMemos still clamps to it, and that reads `dobropis`, which is not
// an AbraFlexi evidence. Do not reuse it when rebuilding credit memos.
export const MAX_PAGE_SIZE = 100
