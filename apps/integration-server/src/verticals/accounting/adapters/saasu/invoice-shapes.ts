/**
 * The Saasu invoice shapes every sale- and purchase-side transform reads.
 *
 * Saasu keeps invoices, bills, orders, expenses and credit notes in one
 * resource, told apart by `InvoiceType` and `TransactionType`
 * (https://api.saasu.com/Help/Api/GET-Invoice-id-optionalargs, fetched
 * 2026-09-29):
 *
 *   - `SaasuInvoiceSummary` — a row of GET Invoices, `InvoiceTransactionSummary`
 *     (https://api.saasu.com/Help/Api/GET-Invoices). No line items.
 *   - `SaasuInvoiceDetail` — GET Invoice/{id}, `InvoiceTransactionDetail`,
 *     returned at the top level of the body, with `LineItems` of
 *     `InvoiceTransactionLineItem`
 *     (https://api.saasu.com/Help/ResourceModel?modelName=InvoiceTransactionLineItem).
 *
 * Amounts are "decimal number" in `Currency` ("The currrency code of the
 * amounts. Eg. AUD."), so every one is converted to minor units with that
 * currency.
 */
import { toMinorUnits } from '../shared/transform'
import type { Lineitem } from '../../schema/shared'

export interface SaasuInvoiceLineItem {
  Id?: number | null
  Description?: string | null
  AccountId?: number | null
  TaxCode?: string | null
  TotalAmount?: number | null
  Quantity?: number | null
  UnitPrice?: number | null
  PercentageDiscount?: number | null
  InventoryId?: number | null
  ItemCode?: string | null
  [key: string]: unknown
}

export interface SaasuInvoiceSummary {
  TransactionId: number
  Currency?: string | null
  InvoiceNumber?: string | null
  InvoiceType?: string | null
  TransactionType?: string | null
  Summary?: string | null
  TotalAmount?: number | null
  TotalTaxAmount?: number | null
  IsTaxInc?: boolean | null
  AmountPaid?: number | null
  AmountOwed?: number | null
  TransactionDate?: string | null
  BillingContactId?: number | null
  ShippingContactId?: number | null
  CreatedDateUtc?: string | null
  LastModifiedDateUtc?: string | null
  /** 'P' = paid, 'U' = unpaid ('A' = all is a filter value only). */
  PaymentStatus?: string | null
  DueDate?: string | null
  PurchaseOrderNumber?: string | null
  [key: string]: unknown
}

export interface SaasuInvoiceDetail extends SaasuInvoiceSummary {
  LineItems?: SaasuInvoiceLineItem[] | null
  /** "Textual notes set by the user." */
  NotesExternal?: string | null
}

/** Line items when the body carried them (GET Invoice/{id}); undefined on a list row. */
export function lineItemsOf(raw: SaasuInvoiceSummary): SaasuInvoiceLineItem[] | undefined {
  const lines = (raw as SaasuInvoiceDetail).LineItems
  return Array.isArray(lines) ? lines : undefined
}

/**
 * One `InvoiceTransactionLineItem` as a canonical line, amounts in minor
 * units. `Quantity` is a "decimal number"; the canonical quantity is an
 * integer, so a fractional one is left out rather than rounded. `TaxCode` is
 * the code string (e.g. "G1"), not the tax code's id, so it is not a
 * `taxrateId`; no per-line tax amount is documented.
 */
export function mapInvoiceLine(item: SaasuInvoiceLineItem, currency: string | undefined): Lineitem {
  const quantity = item.Quantity ?? undefined
  return {
    id: item.Id != null ? String(item.Id) : undefined,
    accountId: item.AccountId != null ? String(item.AccountId) : undefined,
    itemId: item.InventoryId != null ? String(item.InventoryId) : undefined,
    itemSku: item.ItemCode || undefined,
    itemDescription: item.Description || undefined,
    unitAmount: toMinorUnits(item.UnitPrice, currency),
    unitQuantity: quantity !== undefined && Number.isInteger(quantity) ? quantity : undefined,
    totalAmount: toMinorUnits(item.TotalAmount, currency),
  }
}

/**
 * Paid / partly paid / unpaid from the documented `PaymentStatus` ('P' =
 * paid, 'U' = unpaid) and the `AmountPaid` / `AmountOwed` totals. Returned
 * as the vocabulary shared by the invoice and bill statuses.
 */
export function paymentState(
  raw: SaasuInvoiceSummary,
): 'PAID' | 'PARTIALLY_PAID' | 'AUTHORIZED' | 'unknown' | undefined {
  switch (raw.PaymentStatus) {
    case undefined:
    case null:
      return undefined
    case 'P':
      return 'PAID'
    case 'U':
      return typeof raw.AmountPaid === 'number' && raw.AmountPaid > 0
        ? 'PARTIALLY_PAID'
        : 'AUTHORIZED'
    default:
      return 'unknown'
  }
}
