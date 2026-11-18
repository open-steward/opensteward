/**
 * VosFactures → canonical SalesOrder transform.
 *
 * VosFactures represents customer/sales orders as invoice documents with
 * `kind = "client_order"`.  This is the same source as the Order transform but
 * maps to the canonical SalesOrder shape (a more specific sales-side view).
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal } from '../../shared/transform'
import type { VosFacturesInvoice, VosFacturesPosition } from './invoice'

// ── Helpers ───────────────────────────────────────────────────────────────

function mapStatus(raw: VosFacturesInvoice): SalesOrderStatus {
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

export function transformSalesOrder(raw: VosFacturesInvoice): SalesOrder {
  const totalAmount = parseDecimal(raw.price_gross)

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount,
    lineItems: Array.isArray(raw.positions) ? raw.positions.map(mapLineitem) : undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
