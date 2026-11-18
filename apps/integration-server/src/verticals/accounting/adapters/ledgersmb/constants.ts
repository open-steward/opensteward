/**
 * LedgerSMB is a self-hosted application. There is no fixed SaaS base URL;
 * the customer supplies the root URL of their own instance (e.g.
 * https://accounting.example.com). The paths below are appended to that root.
 *
 * REST API docs: https://book.ledgersmb.org/dev/full-book/
 * GitHub: https://github.com/ledgersmb/LedgerSMB
 */

/** Path appended to the instance root to reach the v0 REST API. */
export const LEDGERSMB_API_PATH = 'erp/api/v0'

/** Authentication endpoint path (relative to instance root). */
export const LEDGERSMB_AUTH_PATH = 'login.pl'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
