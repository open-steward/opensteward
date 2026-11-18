import type { Bill } from '../../../schema/bill'
import type { XledgerSubledgerTransaction } from '../relay'

/**
 * A supplier invoice: an `apTransactions` node with a positive `invoiceAmount`
 * ("Supplier invoices", https://xledgerukinternal.zendesk.com/hc/en-us/articles/8714771914898:
 * "Doing this will create account payable (AP) transactions.").
 *
 * Only `dbId` and `invoiceNumber` map; the amounts stay in `metadata` because
 * the article documents no currency on the node, and no status is derived (see
 * `transformInvoice`).
 */
export function transformBill(raw: XledgerSubledgerTransaction): Bill {
  return {
    id: String(raw.dbId),
    billNumber: raw.invoiceNumber || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
