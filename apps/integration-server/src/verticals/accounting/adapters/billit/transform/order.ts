/**
 * Billit Order (OrderType = "OrderForm") → canonical Order transform.
 *
 * Billit's "OrderForm" document type represents customer order forms / quotes
 * that have been confirmed as orders. They are retrieved from GET /v1/orders
 * with an OData filter on OrderType.
 *
 *   OrderDirection = "Income"  → SALES order
 *   OrderDirection = "Cost"    → PURCHASE order (sourcing context)
 */

import type { Order, OrderStatus, OrderType } from '../../../schema/order'
import type { BillitOrder } from './invoice'

// ── Status mapping ────────────────────────────────────────────────────────────

function mapOrderStatus(order: BillitOrder): OrderStatus {
  const status = (order.OrderStatus ?? '').toLowerCase()
  if (status === 'canceled') return 'CANCELLED'
  if (status === 'paid' || order.Paid === true) return 'COMPLETED'
  if (status === 'topay' || status === 'tosend' || status === 'sent') return 'ACTIVE'
  if (status === 'draft') return 'DRAFT'
  return 'DRAFT'
}

// ── Direction mapping ─────────────────────────────────────────────────────────

function mapOrderType(order: BillitOrder): OrderType {
  return (order.OrderDirection ?? '').toLowerCase() === 'cost' ? 'PURCHASE' : 'SALES'
}

// ── Canonical transform ───────────────────────────────────────────────────────

export function transformOrder(raw: BillitOrder): Order {
  const party = raw.CounterParty ?? raw.Customer ?? raw.Supplier
  return {
    id: raw.OrderID != null ? String(raw.OrderID) : undefined,
    status: mapOrderStatus(raw),
    type: mapOrderType(raw),
    contactId: party?.PartyID || party?.Nr || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalIncl,
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    createdAt: raw.Created ? new Date(raw.Created) : undefined,
    updatedAt: raw.LastModified ? new Date(raw.LastModified) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
