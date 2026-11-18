/**
 * RealBooks API constants.
 *
 * RealBooks (realbooks.in) is an Indian cloud accounting/ERP platform for MSMEs.
 * The REST API is POST-only; every request carries auth credentials in the JSON body.
 *
 * Docs: https://www.realbooks.in/api-docs/
 */

export const REALBOOKS_API_BASE = 'https://api.realbooks.in'

// Mandatory request headers (per API documentation)
export const REALBOOKS_CONTENT_TYPE = 'application/json'
export const REALBOOKS_ROOT_URL_HEADER = 'https://api.realbooks.in'

// Endpoint path segments
export const REALBOOKS_INV_VOUCHER_CREATE = '/AMSSERVICE/api/accv/v2/psvcreate'
export const REALBOOKS_INV_VOUCHER_UPDATE = '/AMSSERVICE/api/accv/v2/psvupdate'
export const REALBOOKS_ACC_VOUCHER_CREATE = '/AMSSERVICE/api/accv/v2/vcreate'
export const REALBOOKS_ACC_VOUCHER_UPDATE = '/AMSSERVICE/api/accv/v2/vupdate'
export const REALBOOKS_LEDGER_CREATE_UPDATE = '/AMSSERVICE/api/ledger/update/ledgerdetails'
export const REALBOOKS_LEDGER_FETCH = '/AMSSERVICE/api/ledger/lgname/srchlname'
export const REALBOOKS_SEGMENT_DETAILS = '/AMSSERVICE/api/segment/segidsegname'
export const REALBOOKS_DAYBOOK_BILL_DETAILS = '/AMSSERVICE/api/dailyreport/fetchBillDetails'
export const REALBOOKS_PENDING_BILLS = '/AMSSERVICE/api/dailyreport/device/fetch/pendingBill'
export const REALBOOKS_PROFIT_LOSS = '/AMSSERVICE/api/managementreport/profitLoss/report'
export const REALBOOKS_ACC_VOUCHER_TYPE_LIST = '/AMSSERVICE/api/invreport/device/accvtypeList'

// fetchBillDetails is a date-window report (DD-MM-YYYY) with no paging field.
// These bounds ask it for every voucher: the get methods always send them, and
// the list methods send them unless the caller gives updatedAfter.
export const WHOLE_HISTORY_FROM_DATE = '01-01-2000'
export const WHOLE_HISTORY_TO_DATE = '31-12-2099'

// The `limit` that listContacts and listAccounts still send. The API PDF
// documents no page size, and no maximum, for any endpoint.
export const DEFAULT_PAGE_SIZE = 100
