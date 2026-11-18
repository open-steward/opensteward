/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Order, OrderStatus } from '../../../schema/order'

export interface SzamlazzhuOrderLine {
  id?: string | number
  description?: string
  unit_price?: number
  quantity?: number
  total?: number
  [key: string]: unknown
}

export interface SzamlazzhuOrder {
  id: string | number
  status?: string
  currency?: string
  total?: number
  date?: string
  lines?: SzamlazzhuOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch (status) {
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: SzamlazzhuOrder): Order {
  return {
    id: String(raw.id),
    type: 'SALES',
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map((l) => ({
      id: l.id != null ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.unit_price,
      unitQuantity: l.quantity,
      totalAmount: l.total,
    })),
    metadata: raw as Record<string, unknown>,
  }
}
