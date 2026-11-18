/**
 * Saasu adjustment note → canonical CreditMemo.
 *
 * Saasu documents no credit-note or refund endpoint: the API help index
 * (https://api.saasu.com/Help, fetched 2026-09-29) lists no `CreditRefunds`,
 * `CreditRefund/{id}` or any other refund resource. A credit note is an
 * invoice whose `InvoiceType` is "Adjustment Note" — one of the documented
 * `InvoiceType` values ("Pre-Quote Opportunity", "Quote", "Purchase Order",
 * "Sale Order", "Tax Invoice", "Adjustment Note", "RCT Invoice",
 * "Money In (Income)", "Money Out (Expense)") on GET Invoice/{id}
 * (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs). Saasu's own
 * help: "Adjustment notes (also known as credit notes or refunds) are issued
 * to customers for damaged, returned or undelivered goods"
 * (https://www.saasu.com/help/adjustment-note/). Customer credit notes are the
 * sale side, `TransactionType` 'S'; a purchase-side adjustment note is a
 * supplier credit, not a CreditMemo.
 *
 * Shapes (declared in ../invoice-shapes.ts):
 *   - `SaasuInvoiceSummary` — a row of GET Invoices, `InvoiceTransactionSummary`
 *     (https://api.saasu.com/Help/Api/GET-Invoices). No line items.
 *   - `SaasuInvoiceDetail` — GET Invoice/{id}, `InvoiceTransactionDetail`,
 *     returned at the top level of the body (not wrapped), with `LineItems`
 *     of `InvoiceTransactionLineItem`
 *     (https://api.saasu.com/Help/ResourceModel?modelName=InvoiceTransactionLineItem).
 *
 * Amounts are "decimal number" in `Currency` ("The currrency code of the
 * amounts. Eg. AUD."), so they are converted to minor units with that
 * currency. Saasu's help has the user enter an adjustment note's lines with
 * a negative sign; the API docs do not state the sign of the stored totals,
 * so every header amount is reported as its magnitude, the canonical
 * CreditMemo convention, which is right whichever sign Saasu returns. Line
 * totals are normalised by the note's own sign instead (see documentSign), so
 * a line of the opposite sign stays opposite.
 *
 * `appliedTo` is left out: the adjustment note is created by duplicating the
 * original sale, and nothing documented on the invoice or payment resources
 * links it back to that sale. Applying one to an invoice is a sale payment
 * whose `PaymentItems` carry both transactions
 * (https://api.saasu.com/Help/Api/GET-Payment-id-optionalargs), and that
 * pairing is not a documented link either.
 */
import { toCalendarDate, toMinorUnits, toUtcDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import type {
  SaasuInvoiceDetail,
  SaasuInvoiceLineItem,
  SaasuInvoiceSummary,
} from '../invoice-shapes'

export type { SaasuInvoiceDetail, SaasuInvoiceLineItem, SaasuInvoiceSummary }

/** The documented `InvoiceType` value that is a credit note. */
export const ADJUSTMENT_NOTE = 'Adjustment Note'
/** The documented `TransactionType` for a sale ('S' = sale, 'P' = purchase). */
export const SALE = 'S'

/** Is this invoice a customer credit note (a sale-side adjustment note)? */
export function isSaleAdjustmentNote(raw: SaasuInvoiceSummary | null | undefined): boolean {
  return raw != null && raw.InvoiceType === ADJUSTMENT_NOTE && raw.TransactionType === SALE
}

function magnitude(
  val: number | null | undefined,
  currency: string | undefined,
): number | undefined {
  const minor = toMinorUnits(val, currency)
  return minor === undefined ? undefined : Math.abs(minor)
}

/**
 * `PaymentStatus` is documented as 'P' = paid, 'U' = unpaid. An unpaid
 * adjustment note is an open credit on the customer's account; a paid one has
 * been refunded or applied (https://www.saasu.com/help/adjustment-note/).
 */
function mapStatus(status: string | null | undefined): CreditMemoStatus | undefined {
  switch (status) {
    case undefined:
    case null:
      return undefined
    case 'P':
      return 'PAID'
    case 'U':
      return 'AUTHORIZED'
    default:
      return 'unknown'
  }
}

/**
 * The sign that turns this document's amounts into a credit read as positive:
 * -1 when Saasu stored the note negative, else 1. Taken from the header
 * `TotalAmount`, or, when that is absent or zero, from the sum of the line
 * totals. Header amounts are reported as magnitudes regardless; line totals
 * are multiplied by this sign instead, so a line whose sign differs from the
 * note's (a restocking fee on a returns note) stays opposite and the lines
 * still sum to the header.
 */
function documentSign(raw: SaasuInvoiceSummary, lines: SaasuInvoiceLineItem[] | undefined): number {
  const total =
    typeof raw.TotalAmount === 'number' && raw.TotalAmount !== 0
      ? raw.TotalAmount
      : (lines ?? []).reduce((sum, li) => sum + (li?.TotalAmount ?? 0), 0)
  return total < 0 ? -1 : 1
}

function mapLineitem(
  item: SaasuInvoiceLineItem,
  currency: string | undefined,
  sign: number,
): Lineitem {
  const minorTotal = toMinorUnits(item.TotalAmount, currency)
  const total = minorTotal === undefined ? undefined : minorTotal * sign || 0
  // Which of Quantity or UnitPrice carries the entered negative sign is not
  // documented, so the quantity is reported unsigned and the unit price takes
  // the sign of the normalised line total.
  const unitSign = total !== undefined && total < 0 ? -1 : 1
  const unit = magnitude(item.UnitPrice, currency)
  // Quantity is a "decimal number"; the canonical quantity is an integer, so a
  // fractional one is left out rather than rounded.
  const quantity = item.Quantity == null ? undefined : Math.abs(item.Quantity)
  return {
    id: item.Id != null ? String(item.Id) : undefined,
    accountId: item.AccountId != null ? String(item.AccountId) : undefined,
    itemId: item.InventoryId != null ? String(item.InventoryId) : undefined,
    itemSku: item.ItemCode || undefined,
    itemDescription: item.Description || undefined,
    unitAmount: unit === undefined ? undefined : unit * unitSign || 0,
    unitQuantity: quantity !== undefined && Number.isInteger(quantity) ? quantity : undefined,
    totalAmount: total,
  }
}

export function transformCreditMemo(raw: SaasuInvoiceSummary | SaasuInvoiceDetail): CreditMemo {
  const currency = raw.Currency || undefined
  const lines = (raw as SaasuInvoiceDetail).LineItems
  const notes = (raw as SaasuInvoiceDetail).NotesExternal
  const sign = documentSign(raw, Array.isArray(lines) ? lines : undefined)
  return {
    id: String(raw.TransactionId),
    status: mapStatus(raw.PaymentStatus),
    creditmemoNumber: raw.InvoiceNumber || undefined,
    contactId: raw.BillingContactId != null ? String(raw.BillingContactId) : undefined,
    currency,
    totalAmount: magnitude(raw.TotalAmount, currency),
    taxAmount: magnitude(raw.TotalTaxAmount, currency),
    paidAmount: magnitude(raw.AmountPaid, currency),
    balanceAmount: magnitude(raw.AmountOwed, currency),
    // "Indicates if tax is included in the amounts."
    lineAmountsIncludeTax: typeof raw.IsTaxInc === 'boolean' ? raw.IsTaxInc : undefined,
    notes: notes || undefined,
    lineItems: Array.isArray(lines)
      ? lines.map((li) => mapLineitem(li, currency, sign))
      : undefined,
    postedAt: toCalendarDate(raw.TransactionDate),
    dueAt: toCalendarDate(raw.DueDate),
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
