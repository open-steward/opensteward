import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import type { SendRegningLine } from './invoice'

export interface SendRegningPurchaseOrder {
  id: string
  date?: string
  supplierId?: string
  currency?: string
  status?: string
  lines?: SendRegningLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return 'ACTIVE'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: SendRegningLine): Lineitem {
  return {
    id: line.id,
    accountId: line.accountNo || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.total,
  }
}

export function transformPurchaseOrder(raw: SendRegningPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
