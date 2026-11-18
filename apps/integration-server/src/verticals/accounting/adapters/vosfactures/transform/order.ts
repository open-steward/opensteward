/**
 * VosFactures → canonical Order transform.
 *
 * VosFactures represents customer orders as invoice documents with
 * `kind = "client_order"`.  They share the same endpoint and response shape as
 * regular invoices.  This transform accepts a VosFacturesInvoice already
 * filtered to kind=client_order and maps it to the canonical Order shape.
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal } from '../../shared/transform'
import type { VosFacturesInvoice, VosFacturesPosition } from './invoice'

// ── Helpers ───────────────────────────────────────────────────────────────

function mapStatus(raw: VosFacturesInvoice): OrderStatus {
  switch (raw.status) {
    case 'paid':
    case 'accepted':
      return 'COMPLETED'
    case 'rejected':
      return 'CANCELLED'
    case 'sent':
    case 'partial':
      return 'ACTIVE'
    case 'issued':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(pos: VosFacturesPosition): Lineitem {
  const unitAmount = parseDecimal(pos.price_net)
  const totalAmount = parseDecimal(pos.total_price_gross)
  const netTotal = parseDecimal(pos.total_price_net)
  const taxPct = parseDecimal(pos.tax)
  const taxAmount =
    totalAmount !== undefined && netTotal !== undefined
      ? totalAmount - netTotal
      : taxPct !== undefined && unitAmount !== undefined
        ? (unitAmount * taxPct) / 100
        : undefined

  return {
    id: pos.id !== undefined ? String(pos.id) : undefined,
    itemId: pos.product_id !== undefined ? String(pos.product_id) : undefined,
    itemName: pos.name || undefined,
    itemDescription: pos.description || undefined,
    unitAmount,
    unitQuantity: pos.quantity !== undefined ? Math.round(Number(pos.quantity)) : undefined,
    taxAmount,
    totalAmount,
  }
}

// ── Public transform ──────────────────────────────────────────────────────

export function transformOrder(raw: VosFacturesInvoice): Order {
  const totalAmount = parseDecimal(raw.price_gross)

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount,
    lineItems: Array.isArray(raw.positions) ? raw.positions.map(mapLineitem) : undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
