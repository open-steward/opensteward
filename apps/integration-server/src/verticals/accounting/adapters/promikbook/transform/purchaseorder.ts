import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface PromikBookPurchaseOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  account_no?: string | number
  [key: string]: unknown
}

export interface PromikBookPurchaseOrder {
  id: number | string
  supplier_id?: number | string
  date?: string
  currency?: string
  amount_incl_vat?: number
  status?: string
  lines?: PromikBookPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'confirmed':
      return 'ACTIVE'
    case 'completed':
    case 'received':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: PromikBookPurchaseOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.account_no !== undefined ? String(line.account_no) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformPurchaseOrder(raw: PromikBookPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount_incl_vat,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
