/**
 * WEBHOOK_REFRESH_MAP — canonical webhook resourceType slug → adapter
 * single-resource `get` method, for the inbound webhook consumer's cache
 * refresh. Slugs match the accounting `WebhookResourceType` enum (singular).
 */
export const WEBHOOK_REFRESH_MAP: Record<string, string> = {
  invoice: 'getInvoice',
  bill: 'getBill',
  contact: 'getContact',
  account: 'getAccount',
  journal: 'getJournal',
  transaction: 'getTransaction',
  taxrate: 'getTaxRate',
  expense: 'getExpense',
  creditmemo: 'getCreditMemo',
  order: 'getOrder',
  salesorder: 'getSalesOrder',
  purchaseorder: 'getPurchaseOrder',
}
