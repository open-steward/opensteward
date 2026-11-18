/**
 * Scopevisio offer (Angebot) → canonical SalesOrder transform.
 *
 * Scopevisio exposes offers (quotes / proposals) via:
 *   POST /offers       – search list
 *   GET  /offer/{number} – single record
 *
 * Offers are the closest Scopevisio document type to a canonical SalesOrder
 * (pre-sale document that becomes an order/invoice).
 *
 * Docs: https://appload.scopevisio.com/rest/swagger.json
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface ScopevisioOfferPosition {
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

export interface ScopevisioOffer {
  id?: number
  documentNumber?: string
  status?: string
  customerContactId?: number
  customerContactName?: string
  documentDate?: number     // epoch ms
  currency?: string
  totalGross?: number
  totalNet?: number
  totalVat?: number
  documentText?: string
  positions?: ScopevisioOfferPosition[]
  [key: string]: unknown
}

function mapStatus(raw: ScopevisioOffer): SalesOrderStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'CANCELLED' || s === 'STORNIERT' || s === 'ABGELEHNT') return 'CANCELLED'
  if (s === 'ACCEPTED' || s === 'ANGENOMMEN' || s === 'INVOICED') return 'COMPLETED'
  if (s === 'DRAFT' || s === 'ENTWURF') return 'DRAFT'
  return 'ACTIVE'
}

function toDate(epochMs?: number | null): Date | undefined {
  if (!epochMs) return undefined
  return new Date(epochMs)
}

function mapPosition(pos: ScopevisioOfferPosition): Lineitem {
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

export function transformSalesOrder(raw: ScopevisioOffer): SalesOrder {
  return {
    id: raw.documentNumber ?? (raw.id !== undefined ? String(raw.id) : undefined),
    status: mapStatus(raw),
    contactId: raw.customerContactId !== undefined ? String(raw.customerContactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGross ?? undefined,
    lineItems: (raw.positions ?? []).map(mapPosition),
    postedAt: toDate(raw.documentDate),
    metadata: raw as Record<string, unknown>,
  }
}
