/**
 * CashCtrl order → canonical PurchaseOrder transform.
 *
 * CashCtrl uses a single /order endpoint for all document types. Purchase orders
 * (incoming documents such as supplier requests, orders, invoices, credit notes)
 * are filtered by passing `type: 'PURCHASE'` when listing. This transform maps
 * those records to the canonical PurchaseOrder schema.
 *
 * Note: The same records are also exposed as Bills (bill.ts). PurchaseOrder
 * provides a broader, less status-opinionated view of the same data.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#order
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import type { CashCtrlOrder, CashCtrlOrderItem } from './invoice'

function mapStatus(order: CashCtrlOrder): PurchaseOrderStatus {
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

export function transformPurchaseOrder(raw: CashCtrlOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.associateId != null ? String(raw.associateId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.total ?? undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
