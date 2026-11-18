import type { CreditMemo } from '../../../schema/creditmemo'
import type { XledgerSubledgerTransaction } from '../relay'

/**
 * A customer credit note: an `arTransactions` node with a negative
 * `invoiceAmount`, as in the "Customer invoices" article's "Fully
 * refunded/credited" example (`"invoiceNumber": "B1"`,
 * `"invoiceAmount": "-200.0000"`,
 * https://xledgerukinternal.zendesk.com/hc/en-us/articles/8703588077330).
 *
 * Only `dbId` and `invoiceNumber` map; the amounts stay in `metadata` because
 * the article documents no currency on the node.
 */
export function transformCreditMemo(raw: XledgerSubledgerTransaction): CreditMemo {
  return {
    id: String(raw.dbId),
    creditmemoNumber: raw.invoiceNumber || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
