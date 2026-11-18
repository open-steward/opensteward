/**
 * LEDGERS.Cloud adapter resource coverage metadata.
 *
 * Docs: https://ledgers.readme.io/reference/introduction-1
 *
 * The LEDGERS.Cloud REST API (v3) exposes the following resource categories:
 *   Contacts, Catalog, Quotes, Invoices, Receipts, Credit Notes, Delivery
 *   Challan, Purchase Orders, Purchase Invoices, Vouchers, Debit Notes,
 *   Cash Book / Bank Book, Financial Aging, Financial API, Financial Status,
 *   Employees, Attendance, Salary/Payroll, Documents, Reference data.
 *
 * There are no documented endpoints for journals, general-ledger transactions,
 * generic orders, or sales orders. This was verified via the complete API
 * navigation (https://ledgers.readme.io/reference/introduction-1) and the
 * LLM-index page (https://ledgers.readme.io/llms.txt).
 */

export const metadata = {
  platform: 'ledgers-cloud',
  totalResources: 13,
  availableResources: [
    'account',
    'bill',
    'contact',
    'creditmemo',
    'expense',
    'invoice',
    'organization',
    'purchaseorder',
    'taxrate',
  ],
  unavailableResources: [
    {
      resource: 'journal',
      reason:
        'LEDGERS.Cloud has no journal-entry endpoint; the API navigation lists no journal or journal-entry resource (verified via https://ledgers.readme.io/reference/introduction-1).',
    },
    {
      resource: 'transaction',
      reason:
        'LEDGERS.Cloud has no general-ledger transaction endpoint; the API only exposes cash-book/bank-book list and financial-status aggregates, not individual transaction records.',
    },
    {
      resource: 'order',
      reason:
        'LEDGERS.Cloud has no generic order endpoint; the platform distinguishes only purchase orders and sales documents (invoices/quotes) — a generic "order" resource is absent from the documented API.',
    },
    {
      resource: 'salesorder',
      reason:
        'LEDGERS.Cloud has no sales-order endpoint; while the platform supports sales-order workflows in the UI, there is no corresponding REST API resource documented (verified via https://ledgers.readme.io/reference/introduction-1).',
    },
  ],
} as const
