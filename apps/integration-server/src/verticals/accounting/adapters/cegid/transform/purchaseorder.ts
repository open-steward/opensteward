import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface CegidPurchaseOrderRow {
  id: number
  description: string
  unitPrice: number
  quantity: number
  netAmount: number
  accountId: string
  [key: string]: unknown
}

export interface CegidPurchaseOrder {
  id: string
  supplierId: string
  currency: string
  grossAmount: number
  documentDate: string
  documentStatus: string
  lines: CegidPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(documentStatus: string): PurchaseOrderStatus {
  if (documentStatus === 'Received') return 'COMPLETED'
  if (documentStatus === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: CegidPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.netAmount,
  }
}

export function transformPurchaseOrder(raw: CegidPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.documentStatus),
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
