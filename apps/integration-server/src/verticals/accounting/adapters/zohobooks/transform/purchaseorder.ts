import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface ZohoBooksPurchaseOrderLineItem {
  line_item_id: string
  item_id: string
  description: string
  rate: number
  quantity: number
  item_total: number
  tax_amount: number
  account_id: string
}

export interface ZohoBooksPurchaseOrder {
  purchaseorder_id: string
  purchaseorder_number: string
  vendor_id: string
  date: string
  delivery_date: string
  currency_code: string
  total: number
  tax_total: number
  status: 'draft' | 'issued' | 'billed' | 'cancelled'
  line_items?: ZohoBooksPurchaseOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: ZohoBooksPurchaseOrder['status']): PurchaseOrderStatus {
  switch (status) {
    case 'billed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineItem(li: ZohoBooksPurchaseOrderLineItem): Lineitem {
  return {
    id: li.line_item_id || undefined,
    itemId: li.item_id || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.rate,
    unitQuantity: li.quantity,
    totalAmount: li.item_total,
    taxAmount: li.tax_amount || undefined,
    accountId: li.account_id || undefined,
  }
}

export function transformPurchaseOrder(raw: ZohoBooksPurchaseOrder): PurchaseOrder {
  return {
    id: raw.purchaseorder_id,
    status: mapStatus(raw.status),
    contactId: raw.vendor_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
