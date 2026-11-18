import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ErpNextPurchaseOrderItem {
  name: string
  item_name: string
  qty: number
  rate: number
  amount: number
  item_tax_amount: number
  expense_account: string
  [key: string]: unknown
}

export interface ErpNextPurchaseOrder {
  name: string
  transaction_date: string
  status: string
  currency: string
  base_grand_total: number
  supplier: string
  remarks: string
  items: ErpNextPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'To Receive and Bill':
    case 'To Bill':
    case 'To Receive':
      return 'ACTIVE'
    case 'Completed': return 'COMPLETED'
    case 'Cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(item: ErpNextPurchaseOrderItem): Lineitem {
  return {
    id: item.name || undefined,
    accountId: item.expense_account || undefined,
    itemDescription: item.item_name || undefined,
    unitAmount: item.rate,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.item_tax_amount || undefined,
  }
}

export function transformPurchaseOrder(raw: ErpNextPurchaseOrder): PurchaseOrder {
  return {
    id: raw.name,
    status: mapStatus(raw.status),
    contactId: raw.supplier || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.base_grand_total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.transaction_date ? new Date(raw.transaction_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
