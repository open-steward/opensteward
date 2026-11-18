import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface RegatePurchaseOrderRow {
  id: number
  description: string
  unit_price: number
  quantity: number
  amount_excluding_tax: number
  account_id: string
  [key: string]: unknown
}

export interface RegatePurchaseOrder {
  id: string
  supplier_id: string
  currency: string
  total_amount: number
  date: string
  status: string
  lines: RegatePurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'RECEIVED') return 'COMPLETED'
  if (status === 'CANCELLED') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: RegatePurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount_excluding_tax,
  }
}

export function transformPurchaseOrder(raw: RegatePurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
