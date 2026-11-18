/**
 * CashCtrl order → canonical Invoice transform.
 *
 * In CashCtrl, "orders" are a unified concept covering both outgoing (sales)
 * and incoming (purchase) documents. Sales orders whose category resolves to
 * an invoice type (e.g. "Invoice", "Delivery note") are mapped here as
 * canonical Invoices.
 *
 * The order category's `bookId` field indicates which account is credited on
 * booking. Sales categories typically credit a revenue account; purchase
 * categories credit a payable account.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#order
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface CashCtrlOrderItem {
  id?: number | null
  articleId?: number | null
  accountId?: number | null
  description?: string | null
  unitPrice?: number | null
  quantity?: number | null
  amount?: number | null
  taxId?: number | null
  taxName?: string | null
  taxAmount?: number | null
  discountPercent?: number | null
  [key: string]: unknown
}

/**
 * CashCtrl order record as returned by GET /order/read.json
 * and listed via GET /order/list.json.
 */
export interface CashCtrlOrder {
  id: number
  /** Document / sequence number string (e.g. "RE-2025-0001"). */
  nr?: string | null
  /** Person (contact) id. */
  associateId?: number | null
  /** Order date (ISO date string "YYYY-MM-DD"). */
  date?: string | null
  /** Due date calculated from dueDays. */
  dueDate?: string | null
  /** Payment term in days. */
  dueDays?: number | null
  /** ISO 4217 currency code. */
  currencyCode?: string | null
  /** Total amount including tax. */
  total?: number | null
  /** Total tax amount. */
  totalTax?: number | null
  /** Open (unpaid) amount. */
  openAmount?: number | null
  /** True when all accounting entries are booked. */
  isBooked?: boolean | null
  /** True when the order is closed / completed. */
  isClosed?: boolean | null
  /** Freetext description / reference. */
  description?: string | null
  /** Notes visible on the document. */
  notes?: string | null
  /** Category id (determines sales vs. purchase). */
  categoryId?: number | null
  /** Order status id. */
  statusId?: number | null
  /** Array of line items. */
  items?: CashCtrlOrderItem[] | null
  [key: string]: unknown
}

function mapStatus(order: CashCtrlOrder): InvoiceStatus {
  if (order.isClosed && order.openAmount === 0) return 'PAID'
  if (order.isClosed && (order.openAmount ?? 0) > 0) return 'PARTIALLY_PAID'
  if (order.isBooked) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(item: CashCtrlOrderItem): Lineitem {
  return {
    id: item.id != null ? String(item.id) : undefined,
    accountId: item.accountId != null ? String(item.accountId) : undefined,
    itemId: item.articleId != null ? String(item.articleId) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unitPrice ?? undefined,
    unitQuantity: item.quantity ?? undefined,
    totalAmount: item.amount ?? undefined,
    taxAmount: item.taxAmount ?? undefined,
    discountAmount:
      item.discountPercent != null && item.amount != null
        ? (item.discountPercent / 100) * (item.amount ?? 0)
        : undefined,
  }
}

export function transformInvoice(raw: CashCtrlOrder): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.nr || undefined,
    contactId: raw.associateId != null ? String(raw.associateId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.totalTax ?? undefined,
    balanceAmount: raw.openAmount ?? undefined,
    paidAmount:
      raw.total != null && raw.openAmount != null
        ? raw.total - raw.openAmount
        : undefined,
    notes: raw.notes || undefined,
    reference: raw.description || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
