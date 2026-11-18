/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface Unit4OrderLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount?: number
  accountCode?: string
  [key: string]: unknown
}

export interface Unit4Order {
  orderId: string | number
  orderNumber?: string
  status: string
  customerId?: string | number
  amount: number
  currencyCode?: string
  orderDate?: string
  companyId?: string | number
  lines?: Unit4OrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  switch (status) {
    case 'Completed':
      return 'COMPLETED'
    case 'Cancelled':
      return 'CANCELLED'
    case 'Active':
    case 'Approved':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: Unit4OrderLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformOrder(raw: Unit4Order): Order {
  return {
    id: String(raw.orderId),
    status: mapStatus(raw.status),
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
