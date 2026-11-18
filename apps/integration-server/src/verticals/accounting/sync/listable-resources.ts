/**
 * LISTABLE_RESOURCES — the set of (resourceType, adapter method) pairs the
 * background sync worker iterates over when fulfilling a sync job.
 *
 * Kept separate from sync-schema.ts so the Zod job/progress schemas stay
 * apart from the vertical-specific resource registry.
 */
export const LISTABLE_RESOURCES: Array<{ resourceType: string; method: string }> = [
  { resourceType: 'invoices', method: 'listInvoices' },
  { resourceType: 'bills', method: 'listBills' },
  { resourceType: 'contacts', method: 'listContacts' },
  { resourceType: 'accounts', method: 'listAccounts' },
  { resourceType: 'journals', method: 'listJournals' },
  { resourceType: 'transactions', method: 'listTransactions' },
  { resourceType: 'taxrates', method: 'listTaxRates' },
  { resourceType: 'expenses', method: 'listExpenses' },
  { resourceType: 'creditmemos', method: 'listCreditMemos' },
  { resourceType: 'orders', method: 'listOrders' },
  { resourceType: 'salesorders', method: 'listSalesOrders' },
  { resourceType: 'purchaseorders', method: 'listPurchaseOrders' },
]
