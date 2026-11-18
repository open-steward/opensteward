import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface CegidOrderRow {
  id: number
  description: string
  unitPrice: number
  quantity: number
  netAmount: number
  accountId: string
  [key: string]: unknown
}

export interface CegidOrder {
  id: string
  customerId: string
  currency: string
  grossAmount: number
  documentDate: string
  documentStatus: string
  lines: CegidOrderRow[]
  [key: string]: unknown
}

function mapStatus(documentStatus: string): OrderStatus {
  if (documentStatus === 'Invoiced') return 'COMPLETED'
  if (documentStatus === 'Cancelled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: CegidOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.netAmount,
  }
}

export function transformOrder(raw: CegidOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.documentStatus),
    type: 'SALES',
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
