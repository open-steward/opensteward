import type { Invoice } from '../../../schema/invoice'
import type { XledgerSubledgerTransaction } from '../relay'

/**
 * A customer invoice: an `arTransactions` node with a positive `invoiceAmount`
 * ("Customer invoices", https://xledgerukinternal.zendesk.com/hc/en-us/articles/8703588077330:
 * "Doing this will create account receivable (AR) transactions.").
 *
 * Only `dbId` and `invoiceNumber` map. The amounts are major-unit decimal
 * strings ("Customer A is invoiced £200" answers `"invoiceAmount": "200.0000"`),
 * but the article documents no currency on the node and canonical money needs
 * one, so `invoiceAmount` and `invoiceRemaining` stay in `metadata` rather than
 * being paired with a guessed currency. No status is derived either: the article's rule
 * ("When invoiceRemaining = 0 and reconciled = true this means the invoice has
 * been paid in full") also matches its own "Fully refunded/credited" invoice.
 */
export function transformInvoice(raw: XledgerSubledgerTransaction): Invoice {
  return {
    id: String(raw.dbId),
    type: 'INVOICE',
    invoiceNumber: raw.invoiceNumber || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
