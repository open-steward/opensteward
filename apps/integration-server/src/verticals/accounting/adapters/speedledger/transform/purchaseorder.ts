import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface SpeedLedgerPurchaseOrderLine {
  id?: number | string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  accountNumber?: string | number
  [key: string]: unknown
}

export interface SpeedLedgerPurchaseOrder {
  id: number | string
  contactId?: number | string
  date?: string
  currency?: string
  totalInclVat?: number
  status?: string
  lines?: SpeedLedgerPurchaseOrderLine[]
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

function mapLineitem(line: SpeedLedgerPurchaseOrderLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.accountNumber !== undefined ? String(line.accountNumber) : undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformPurchaseOrder(raw: SpeedLedgerPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contactId !== undefined ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalInclVat,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
