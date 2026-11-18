// TallyPrime exposes a local HTTP server (TDL plugin required)
// Default host: localhost, default port: 9000
export const TALLY_DEFAULT_HOST = 'localhost'
export const TALLY_DEFAULT_PORT = 9000

// Rate limit: 100/min (local server limit)
export const DEFAULT_PAGE_SIZE = 100

// Lower bound for SVFROMDATE when a list call gives no `updatedAfter`: wide
// enough to include a company's full voucher history without depending on
// whatever "current period" happens to be set in the Tally UI.
export const TALLY_EARLIEST_DATE = '19000101'
