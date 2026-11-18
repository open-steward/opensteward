/**
 * Crater estimate → canonical Order transform.
 *
 * Crater exposes estimates via GET /api/v1/estimates and GET /api/v1/estimates/{id}.
 * Estimates (quotes) are the closest Crater resource to a sales order / order.
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface CraterEstimateItem {
  id: string
  name?: string
  description?: string
  price?: number
  quantity?: number
  total?: number
  tax?: number
  [key: string]: unknown
}

export interface CraterEstimate {
  id: string
  estimate_number?: string
  status?: string         // DRAFT | SENT | VIEWED | EXPIRED | ACCEPTED | REJECTED
  customer_business_id?: string
  estimate_date?: string
  expiry_date?: string
  total?: number
  sub_total?: number
  tax?: number
  notes?: string
  items?: CraterEstimateItem[]
  currency?: { code?: string }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): OrderStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'ACCEPTED':  return 'COMPLETED'
    case 'REJECTED':
    case 'EXPIRED':   return 'CANCELLED'
    case 'SENT':
    case 'VIEWED':
    case 'ACTIVE':    return 'ACTIVE'
    case 'DRAFT':
    default:          return 'DRAFT'
  }
}

function mapLineitem(item: CraterEstimateItem): Lineitem {
  return {
    id: item.id || undefined,
    itemName: item.name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.price,
    unitQuantity: item.quantity,
    taxAmount: item.tax || undefined,
    totalAmount: item.total,
  }
}

export function transformOrder(raw: CraterEstimate): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customer_business_id ? String(raw.customer_business_id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.estimate_date ? new Date(raw.estimate_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
