/**
 * CashCtrl order → canonical Order transform.
 *
 * CashCtrl uses a single /order endpoint for all document types (offers,
 * invoices, credit notes, purchase orders, etc.). This transform maps any
 * CashCtrl order record to the canonical Order schema — without filtering
 * by category/type — so that the full order list is exposed as generic Orders.
 *
 * For type-specific views see:
 *   - invoice.ts (SALES orders → Invoice)
 *   - bill.ts    (PURCHASE orders → Bill)
 *   - salesorder.ts    (SALES orders → SalesOrder)
 *   - purchaseorder.ts (PURCHASE orders → PurchaseOrder)
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#order
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { CashCtrlOrder, CashCtrlOrderItem } from './invoice'

function mapStatus(order: CashCtrlOrder): OrderStatus {
  if (order.isClosed) return 'COMPLETED'
  if (order.isBooked) return 'ACTIVE'
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

export function transformOrder(raw: CashCtrlOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    // CashCtrl does not return the category type string on the order record;
    // category lookup would require a separate API call. Omit rather than fabricate.
    contactId: raw.associateId != null ? String(raw.associateId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.total ?? undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
