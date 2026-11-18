import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface VismaBusinessNxtOrderLine {
  id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  accountNumber?: string
  [key: string]: unknown
}

export interface VismaBusinessNxtOrder {
  id: string
  customerId?: string
  date?: string
  currency?: string
  grossAmount?: number
  status?: string
  lines?: VismaBusinessNxtOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'Open':
      return 'ACTIVE'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: VismaBusinessNxtOrderLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountNumber || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformOrder(raw: VismaBusinessNxtOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
