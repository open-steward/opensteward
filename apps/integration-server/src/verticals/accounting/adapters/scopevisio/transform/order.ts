/**
 * Scopevisio dispatch (Lieferschein) → canonical Order transform.
 *
 * Scopevisio exposes dispatch / delivery notes via:
 *   POST /dispatches       – search list
 *   GET  /dispatch/{number} – single record
 *
 * Dispatches represent fulfilment orders in Scopevisio and are the closest
 * match to the canonical Order type.  Field structure mirrors
 * ScopevisioOutgoingInvoice.
 *
 * Docs: https://appload.scopevisio.com/rest/swagger.json
 */

import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface ScopevisioDispatchPosition {
  id?: number
  productNumber?: string | null
  name?: string | null
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
  totalGross?: number | null
  totalVat?: number | null
  accountNumber?: string | null
  [key: string]: unknown
}

export interface ScopevisioDispatch {
  id?: number
  documentNumber?: string
  status?: string
  customerContactId?: number
  customerContactName?: string
  documentDate?: number     // epoch ms
  deliveryDate?: number     // epoch ms
  currency?: string
  totalGross?: number
  totalNet?: number
  totalVat?: number
  orderNumber?: string
  documentText?: string
  positions?: ScopevisioDispatchPosition[]
  [key: string]: unknown
}

function mapStatus(raw: ScopevisioDispatch): OrderStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'CANCELLED' || s === 'STORNIERT') return 'CANCELLED'
  if (s === 'DELIVERED' || s === 'GELIEFERT' || s === 'COMPLETED') return 'COMPLETED'
  return 'ACTIVE'
}

function toDate(epochMs?: number | null): Date | undefined {
  if (!epochMs) return undefined
  return new Date(epochMs)
}

function mapPosition(pos: ScopevisioDispatchPosition): Lineitem {
  return {
    id: pos.id !== undefined ? String(pos.id) : undefined,
    accountId: pos.accountNumber || undefined,
    itemId: pos.productNumber || undefined,
    itemName: pos.name || undefined,
    itemDescription: pos.description || undefined,
    unitAmount: pos.unitPrice ?? undefined,
    unitQuantity: pos.quantity !== undefined && pos.quantity !== null ? Math.round(pos.quantity) : undefined,
    totalAmount: pos.totalGross ?? undefined,
    taxAmount: pos.totalVat ?? undefined,
  }
}

export function transformOrder(raw: ScopevisioDispatch): Order {
  return {
    id: raw.documentNumber ?? (raw.id !== undefined ? String(raw.id) : undefined),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.customerContactId !== undefined ? String(raw.customerContactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGross ?? undefined,
    lineItems: (raw.positions ?? []).map(mapPosition),
    postedAt: toDate(raw.documentDate),
    metadata: raw as Record<string, unknown>,
  }
}
