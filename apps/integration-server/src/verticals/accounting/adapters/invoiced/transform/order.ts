/**
 * Invoiced Estimate → canonical Order transform.
 *
 * Invoiced has no native "order" concept. Estimates (quotes presented to customers
 * before invoicing) are the closest analogue and are mapped as SALES orders.
 *
 * Estimate statuses: draft, not_sent, sent, approved, invoiced, declined, voided
 * Docs: https://developer.invoiced.com/api/estimates
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface InvoicedEstimateLineItem {
  id: number
  catalog_item: string | null
  name: string | null
  description: string | null
  quantity: number
  unit_cost: number
  amount: number
  [key: string]: unknown
}

export interface InvoicedEstimate {
  id: number
  object: string
  customer: number
  number: string | null
  status: string
  draft: boolean
  closed: boolean
  approved: boolean
  currency: string
  date: number | null
  expiration_date: number | null
  items: InvoicedEstimateLineItem[]
  subtotal: number
  total: number
  notes: string | null
  url: string | null
  pdf_url: string | null
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  [key: string]: unknown
}

function mapStatus(raw: InvoicedEstimate): OrderStatus {
  const s = raw.status
  if (s === 'voided' || s === 'declined') return 'CANCELLED'
  if (s === 'invoiced') return 'COMPLETED'
  if (s === 'draft') return 'DRAFT'
  // not_sent, sent, approved
  return 'ACTIVE'
}

function mapLineitem(li: InvoicedEstimateLineItem): Lineitem {
  return {
    id: String(li.id),
    itemId: li.catalog_item || undefined,
    itemName: li.name || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_cost,
    unitQuantity: li.quantity,
    totalAmount: li.amount,
  }
}

export function transformOrder(raw: InvoicedEstimate): Order {
  return {
    id: String(raw.id),
    type: 'SALES',
    status: mapStatus(raw),
    contactId: raw.customer ? String(raw.customer) : undefined,
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at * 1000) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
