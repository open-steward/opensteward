/**
 * KLARA offer/quote (Offerte) transform — mapped to canonical Order.
 *
 * KLARA offers are pre-invoice sales documents sent to customers.
 * Fields: id, offer_number, status, contact_id, currency, total_amount,
 *         offer_date, expiry_date, notes, positions[]
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface KlaraOfferPosition {
  id?: string
  article_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  tax_rate_id?: string
  account_id?: string
  [key: string]: unknown
}

export interface KlaraOffer {
  id: string
  offer_number?: string
  status?: string
  contact_id?: string
  currency?: string
  total_amount?: number
  offer_date?: string
  expiry_date?: string
  notes?: string
  created_at?: string
  updated_at?: string
  positions?: KlaraOfferPosition[]
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): OrderStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft': return 'DRAFT'
    case 'sent':
    case 'open': return 'ACTIVE'
    case 'accepted':
    case 'won': return 'COMPLETED'
    case 'rejected':
    case 'declined':
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapPositions(positions: KlaraOfferPosition[]): Lineitem[] {
  return positions.map((p) => ({
    id: p.id || undefined,
    accountId: p.account_id || undefined,
    itemId: p.article_id || undefined,
    itemDescription: p.description || undefined,
    unitAmount: p.unit_price,
    unitQuantity: p.quantity != null ? Math.round(p.quantity) : undefined,
    totalAmount: p.total_price,
    taxrateId: p.tax_rate_id || undefined,
  }))
}

export function transformOrder(raw: KlaraOffer): Order {
  return {
    id: raw.id || undefined,
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.positions ?? []).length > 0 ? mapPositions(raw.positions ?? []) : undefined,
    postedAt: raw.offer_date ? new Date(raw.offer_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
