import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface SilverfinPurchaseOrderLine {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  tax_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface SilverfinPurchaseOrder {
  id: string | number
  status: string
  order_number: string
  period: string
  total_amount: number
  currency: string
  contact_id: string | number
  lines: SilverfinPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'approved':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: SilverfinPurchaseOrderLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.account_id ? String(line.account_id) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total_amount,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformPurchaseOrder(raw: SilverfinPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.period ? new Date(raw.period) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
