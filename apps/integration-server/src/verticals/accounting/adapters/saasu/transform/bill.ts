/**
 * Saasu purchase invoice → canonical Bill.
 *
 * A supplier bill is an invoice whose `TransactionType` is 'P' (purchase) and
 * whose `InvoiceType` is "Tax Invoice" or "RCT Invoice"
 * (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs, fetched
 * 2026-09-29). An RCT invoice is a purchase: "Saasu supports RCTI's through
 * the Type drop down in the Purchase screen" (https://www.saasu.com/help/rcti/),
 * and the purchase workflow lists "Recipient Created Tax Invoice (RCTI)"
 * beside "Purchase Tax Invoice" (https://www.saasu.com/help/purchases/).
 * Purchase orders, quotes, adjustment notes and "Money Out (Expense)" are
 * not bills. Fields are mapped as for the invoice (see ./invoice.ts), with
 * `BillingContactId` as the supplier.
 */
import type { Bill } from '../../../schema/bill'
import { toCalendarDate, toMinorUnits, toUtcDate } from '../../shared/transform'
import {
  lineItemsOf,
  mapInvoiceLine,
  paymentState,
  type SaasuInvoiceDetail,
  type SaasuInvoiceSummary,
} from '../invoice-shapes'
import { INVOICE_TYPE, TRANSACTION_TYPE } from '../constants'

const BILL_TYPES: ReadonlySet<string> = new Set([
  INVOICE_TYPE.TAX_INVOICE,
  INVOICE_TYPE.RCT_INVOICE,
])

/** Is this a supplier bill (a purchase-side "Tax Invoice" or "RCT Invoice")? */
export function isPurchaseBill(raw: SaasuInvoiceSummary | null | undefined): boolean {
  return (
    raw != null &&
    raw.TransactionType === TRANSACTION_TYPE.PURCHASE &&
    typeof raw.InvoiceType === 'string' &&
    BILL_TYPES.has(raw.InvoiceType)
  )
}

export function transformBill(raw: SaasuInvoiceSummary | SaasuInvoiceDetail): Bill {
  const currency = raw.Currency || undefined
  const lines = lineItemsOf(raw)
  return {
    id: String(raw.TransactionId),
    status: paymentState(raw),
    billNumber: raw.InvoiceNumber || undefined,
    contactId: raw.BillingContactId != null ? String(raw.BillingContactId) : undefined,
    currency,
    totalAmount: toMinorUnits(raw.TotalAmount, currency),
    taxAmount: toMinorUnits(raw.TotalTaxAmount, currency),
    paidAmount: toMinorUnits(raw.AmountPaid, currency),
    balanceAmount: toMinorUnits(raw.AmountOwed, currency),
    notes: (raw as SaasuInvoiceDetail).NotesExternal || undefined,
    lineAmountsIncludeTax: typeof raw.IsTaxInc === 'boolean' ? raw.IsTaxInc : undefined,
    lineItems: lines?.map((li) => mapInvoiceLine(li, currency)),
    postedAt: toCalendarDate(raw.TransactionDate),
    dueAt: toCalendarDate(raw.DueDate),
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
