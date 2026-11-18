/**
 * Saasu sale tax invoice → canonical Invoice.
 *
 * A customer invoice is an invoice whose `TransactionType` is 'S' (sale) and
 * whose `InvoiceType` is "Tax Invoice" — the documented type list is
 * "Pre-Quote Opportunity", "Quote", "Purchase Order", "Sale Order",
 * "Tax Invoice", "Adjustment Note", "RCT Invoice", "Money In (Income)",
 * "Money Out (Expense)" (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs,
 * fetched 2026-09-29). Field names and meanings are from that page and from
 * GET Invoices (https://api.saasu.com/Help/Api/GET-Invoices):
 *
 *   TransactionId → id            BillingContactId → contactId (a Contact `Id`)
 *   InvoiceNumber → invoiceNumber Currency → currency ("Eg. AUD")
 *   TotalAmount → totalAmount     TotalTaxAmount → taxAmount
 *   AmountPaid → paidAmount       AmountOwed → balanceAmount
 *   IsTaxInc → lineAmountsIncludeTax ("Indicates if tax is included in the amounts")
 *   PurchaseOrderNumber → reference
 *   NotesExternal → notes ("Textual notes set by the user"; detail only)
 *   TransactionDate → postedAt, DueDate → dueAt (calendar dates)
 *   CreatedDateUtc / LastModifiedDateUtc → createdAt / updatedAt
 *   PaymentStatus ('P' = paid, 'U' = unpaid) → status
 *
 * Amounts are "decimal number" in `Currency`, converted to minor units with
 * it. A list row (`InvoiceTransactionSummary`) carries no `LineItems`, so
 * `lineItems` is left unset there rather than reported empty.
 */
import type { Invoice } from '../../../schema/invoice'
import { toCalendarDate, toMinorUnits, toUtcDate } from '../../shared/transform'
import {
  lineItemsOf,
  mapInvoiceLine,
  paymentState,
  type SaasuInvoiceDetail,
  type SaasuInvoiceSummary,
} from '../invoice-shapes'
import { INVOICE_TYPE, TRANSACTION_TYPE } from '../constants'

export type SaasuInvoice = SaasuInvoiceSummary | SaasuInvoiceDetail

/** Is this a customer invoice (a sale-side "Tax Invoice")? */
export function isSaleInvoice(raw: SaasuInvoiceSummary | null | undefined): boolean {
  return (
    raw != null &&
    raw.TransactionType === TRANSACTION_TYPE.SALE &&
    raw.InvoiceType === INVOICE_TYPE.TAX_INVOICE
  )
}

export function transformInvoice(raw: SaasuInvoice): Invoice {
  const currency = raw.Currency || undefined
  const lines = lineItemsOf(raw)
  return {
    id: String(raw.TransactionId),
    type: 'INVOICE',
    status: paymentState(raw),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.BillingContactId != null ? String(raw.BillingContactId) : undefined,
    currency,
    totalAmount: toMinorUnits(raw.TotalAmount, currency),
    taxAmount: toMinorUnits(raw.TotalTaxAmount, currency),
    paidAmount: toMinorUnits(raw.AmountPaid, currency),
    balanceAmount: toMinorUnits(raw.AmountOwed, currency),
    reference: raw.PurchaseOrderNumber || undefined,
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
