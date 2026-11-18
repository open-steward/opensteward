/**
 * Saasu "Money Out (Expense)" → canonical Expense.
 *
 * An expense is a purchase (`TransactionType` 'P') whose `InvoiceType` is
 * "Money Out (Expense)" (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs,
 * fetched 2026-09-29): "Quick transactions (eg basic expenses where you don't
 * really track the supplier)" (https://www.saasu.com/help/purchases/).
 *
 *   TransactionId → id        BillingContactId → contactId
 *   Summary → name            Currency → currency
 *   TotalAmount → totalAmount TotalTaxAmount → taxAmount
 *   IsTaxInc → lineAmountsIncludeTax
 *   TransactionDate → postedAt, CreatedDateUtc / LastModifiedDateUtc
 *
 * Amounts are "decimal number" in `Currency`, converted to minor units.
 */
import type { Expense } from '../../../schema/expense'
import { toCalendarDate, toMinorUnits, toUtcDate } from '../../shared/transform'
import {
  lineItemsOf,
  mapInvoiceLine,
  type SaasuInvoiceDetail,
  type SaasuInvoiceSummary,
} from '../invoice-shapes'
import { INVOICE_TYPE, TRANSACTION_TYPE } from '../constants'

/** Is this a "Money Out (Expense)" purchase? */
export function isExpense(raw: SaasuInvoiceSummary | null | undefined): boolean {
  return (
    raw != null &&
    raw.TransactionType === TRANSACTION_TYPE.PURCHASE &&
    raw.InvoiceType === INVOICE_TYPE.MONEY_OUT
  )
}

export function transformExpense(raw: SaasuInvoiceSummary | SaasuInvoiceDetail): Expense {
  const currency = raw.Currency || undefined
  const lines = lineItemsOf(raw)
  return {
    id: String(raw.TransactionId),
    name: raw.Summary || undefined,
    contactId: raw.BillingContactId != null ? String(raw.BillingContactId) : undefined,
    currency,
    taxAmount: toMinorUnits(raw.TotalTaxAmount, currency),
    totalAmount: toMinorUnits(raw.TotalAmount, currency),
    lineAmountsIncludeTax: typeof raw.IsTaxInc === 'boolean' ? raw.IsTaxInc : undefined,
    lineItems: lines?.map((li) => mapInvoiceLine(li, currency)),
    postedAt: toCalendarDate(raw.TransactionDate),
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}
