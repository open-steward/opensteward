import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import type { GiddhOrderVoucher, GiddhOrderEntry } from './order'

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status?.toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'cancelled':
      return 'CANCELLED'
    case 'completed':
    case 'received':
      return 'COMPLETED'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(entry: GiddhOrderEntry): Lineitem {
  return {
    accountId: entry.accountUniqueName || undefined,
    itemDescription: entry.description || undefined,
    unitAmount: entry.rate,
    unitQuantity: entry.quantity,
    totalAmount: entry.amount,
  }
}

export function transformPurchaseOrder(raw: GiddhOrderVoucher): PurchaseOrder {
  return {
    id: raw.uniqueName,
    status: mapStatus(raw.status),
    contactId: raw.account?.uniqueName || undefined,
    totalAmount: raw.grandTotal,
    lineItems: (raw.entries ?? []).map(mapLineitem),
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
