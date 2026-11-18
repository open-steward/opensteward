import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface EvolizPurchaseOrderRow {
  id: number
  designation: string
  unit_price: number
  quantity: number
  total_without_taxes: number
  account_code: string
  [key: string]: unknown
}

export interface EvolizPurchaseOrder {
  id: string
  supplier_id: string
  currency: string
  total_with_taxes: number
  invoice_date: string
  invoice_status: string
  items: EvolizPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(invoice_status: string): PurchaseOrderStatus {
  if (invoice_status === 'RECEIVED') return 'COMPLETED'
  if (invoice_status === 'CANCELLED') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: EvolizPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.designation || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total_without_taxes,
  }
}

export function transformPurchaseOrder(raw: EvolizPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.invoice_status),
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_with_taxes,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
