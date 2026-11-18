import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { DeskeraDocumentItem } from './invoice'

export interface DeskeraOrder {
  id: string
  documentSequenceCode?: string
  documentDate?: string
  validTillDate?: string
  totalAmount?: number
  taxAmount?: number
  currency?: string
  contactCode?: string
  contactName?: string
  status?: string
  documentItems?: DeskeraDocumentItem[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'CLOSED':
      return 'COMPLETED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(item: DeskeraDocumentItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.accountCode || undefined,
    itemDescription: item.description || item.name || undefined,
    unitAmount: item.unitPrice,
    unitQuantity: item.quantity,
    totalAmount: item.totalAmount ?? 0,
    taxAmount: item.taxAmount || undefined,
    discountAmount: item.discountAmount || undefined,
  }
}

export function transformOrder(raw: DeskeraOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contactCode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount ?? 0,
    lineItems: (raw.documentItems ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
