// Every endpoint below is relative to this base: the hypermedia links in the
// documented samples are https://api.saasu.com/Invoices?FileId=123 and so on
// (https://api.saasu.com/Help, fetched 2026-09-29).
export const SAASU_API_BASE = 'https://api.saasu.com/'
export const SAASU_SETTINGS_URL = 'https://secure.saasu.com/settings/api'

// Rate limit: 10,000 requests a day. No list is widened by a per-row fetch.
export const RATE_LIMIT_PER_DAY = 10_000
// `PageSize` on GET Invoices, Contacts, Accounts, Journals and TaxCodes:
// "Maximum page size is 100. Defaults to 25 if not specified."
// (https://api.saasu.com/Help/Api/GET-Invoices and the sibling pages)
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/**
 * `InvoiceType` values: "Available types are: "Pre-Quote Opportunity",
 * "Quote" , "Purchase Order", "Sale Order", "Tax Invoice", "Adjustment Note",
 * "RCT Invoice", "Money In (Income)", "Money Out (Expense)""
 * (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs).
 */
export const INVOICE_TYPE = {
  PURCHASE_ORDER: 'Purchase Order',
  SALE_ORDER: 'Sale Order',
  TAX_INVOICE: 'Tax Invoice',
  ADJUSTMENT_NOTE: 'Adjustment Note',
  RCT_INVOICE: 'RCT Invoice',
  MONEY_OUT: 'Money Out (Expense)',
} as const

/** `TransactionType`: "'S' = sale, 'P' = purchase" (same page). */
export const TRANSACTION_TYPE = { SALE: 'S', PURCHASE: 'P' } as const
