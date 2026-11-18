/**
 * Saasu sale or purchase order → canonical Order.
 *
 * Saasu has no order resource: an order is an invoice whose `InvoiceType` is
 * "Sale Order" (`TransactionType` 'S') or "Purchase Order" (`TransactionType`
 * 'P') (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs, fetched
 * 2026-09-29). The order stage precedes the invoice: "Sales Order – Goods
 * have not been delivered/manufactured for the customer. No money owed by the
 * customer yet" (https://www.saasu.com/help/sales/), "Purchase Order – Goods
 * have not been delivered/manufactured by the supplier"
 * (https://www.saasu.com/help/purchases/), and "Once you have selected a
 * type, you cannot change it back up the list". A document still typed as an
 * order is therefore an open order, `ACTIVE`; once invoiced it is no longer
 * an order at all.
 *
 *   TransactionId → id, BillingContactId → contactId, Currency → currency,
 *   TotalAmount → totalAmount (minor units), IsTaxInc → lineAmountsIncludeTax,
 *   TransactionDate → postedAt, CreatedDateUtc / LastModifiedDateUtc.
 */
import type { Order } from '../../../schema/order'
import { toCalendarDate, toMinorUnits, toUtcDate } from '../../shared/transform'
import {
  lineItemsOf,
  mapInvoiceLine,
  type SaasuInvoiceDetail,
  type SaasuInvoiceSummary,
} from '../invoice-shapes'
import { INVOICE_TYPE, TRANSACTION_TYPE } from '../constants'

/** Is this a sale order? */
export function isSaleOrder(raw: SaasuInvoiceSummary | null | undefined): boolean {
  return (
    raw != null &&
    raw.TransactionType === TRANSACTION_TYPE.SALE &&
    raw.InvoiceType === INVOICE_TYPE.SALE_ORDER
  )
}

/** Is this a purchase order? */
export function isPurchaseOrder(raw: SaasuInvoiceSummary | null | undefined): boolean {
  return (
    raw != null &&
    raw.TransactionType === TRANSACTION_TYPE.PURCHASE &&
    raw.InvoiceType === INVOICE_TYPE.PURCHASE_ORDER
  )
}

/** The fields every order shape shares. */
export function orderFields(raw: SaasuInvoiceSummary | SaasuInvoiceDetail) {
  const currency = raw.Currency || undefined
  const lines = lineItemsOf(raw)
  return {
    id: String(raw.TransactionId),
    status: 'ACTIVE' as const,
    contactId: raw.BillingContactId != null ? String(raw.BillingContactId) : undefined,
    currency,
    totalAmount: toMinorUnits(raw.TotalAmount, currency),
    lineAmountsIncludeTax: typeof raw.IsTaxInc === 'boolean' ? raw.IsTaxInc : undefined,
    lineItems: lines?.map((li) => mapInvoiceLine(li, currency)),
    postedAt: toCalendarDate(raw.TransactionDate),
    createdAt: toUtcDate(raw.CreatedDateUtc),
    updatedAt: toUtcDate(raw.LastModifiedDateUtc),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOrder(raw: SaasuInvoiceSummary | SaasuInvoiceDetail): Order {
  return {
    ...orderFields(raw),
    type: raw.TransactionType === TRANSACTION_TYPE.PURCHASE ? 'PURCHASE' : 'SALES',
  }
}
