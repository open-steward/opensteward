/**
 * Misoca (Yayoi) estimate → Order transform.
 *
 * Misoca estimate fields (from /api/v3/estimates and /api/v3/estimate/{id}):
 *   id, estimate_number, subject, issue_date, expire_date, total_amount,
 *   body, contact_id, estimate_status, items[]
 *
 * estimate_status: "unsubmitted" | "submitted" | "trashed" | "accepted" | "rejected"
 *
 * Docs: https://doc.misoca.jp/v3/
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { MisocaItem } from './invoice'

export interface MisocaEstimate {
  id: number
  estimate_number?: string
  subject?: string
  issue_date?: string
  expire_date?: string
  total_amount?: number
  tax_amount?: number
  body?: string
  contact_id?: number
  estimate_status?: string
  created_at?: string
  updated_at?: string
  items?: MisocaItem[]
  [key: string]: unknown
}

function mapStatus(status: string | undefined): OrderStatus {
  switch (status) {
    case 'accepted': return 'COMPLETED'
    case 'rejected':
    case 'trashed': return 'CANCELLED'
    case 'submitted': return 'ACTIVE'
    default: return 'DRAFT'
  }
}

function mapLineitems(items: MisocaItem[] | undefined): Lineitem[] | undefined {
  if (!items?.length) return undefined
  return items.map((item) => ({
    id: item.id != null ? String(item.id) : undefined,
    itemName: item.name || undefined,
    itemDescription: item.name || undefined,
    unitAmount: item.unit_price != null ? item.unit_price : undefined,
    unitQuantity: item.quantity != null ? item.quantity : undefined,
    totalAmount: item.price != null ? item.price : undefined,
  }))
}

export function transformOrder(raw: MisocaEstimate): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estimate_status),
    type: 'SALES',
    contactId: raw.contact_id != null ? String(raw.contact_id) : undefined,
    totalAmount: raw.total_amount,
    lineItems: mapLineitems(raw.items),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
