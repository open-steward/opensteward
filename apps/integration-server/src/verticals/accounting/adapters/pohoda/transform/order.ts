/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface PohodaOrderLine {
  id: string | number
  text?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface PohodaOrder {
  id: string | number
  state?: number
  partnerId?: string | number
  currency?: string
  totalAmount?: number
  date?: string
  items?: PohodaOrderLine[]
  [key: string]: unknown
}

function mapStatus(state?: number): OrderStatus {
  switch (state) {
    case 2: return 'ACTIVE'
    case 3: return 'COMPLETED'
    case 0: return 'CANCELLED'
    case 1: default: return 'DRAFT'
  }
}

export function transformOrder(raw: PohodaOrder): Order {
  return {
    id: String(raw.id),
    type: 'SALES',
    status: mapStatus(raw.state),
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.text || undefined,
      unitAmount: l.unitPrice,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
