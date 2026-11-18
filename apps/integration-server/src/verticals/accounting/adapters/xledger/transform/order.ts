import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface XledgerOrderLine {
  id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  accountCode?: string
  [key: string]: unknown
}

export interface XledgerOrder {
  id: string
  entityCode?: string
  transactionDate?: string
  currency?: string
  grossAmount?: number
  status?: number
  lines?: XledgerOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): OrderStatus {
  switch (status) {
    case 10:
      return 'DRAFT'
    case 20:
      return 'ACTIVE'
    case 40:
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: XledgerOrderLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
  }
}

export function transformOrder(raw: XledgerOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.entityCode || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
