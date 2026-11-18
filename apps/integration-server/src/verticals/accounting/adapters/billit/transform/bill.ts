/**
 * Billit Order (OrderDirection = "Cost") → canonical Bill transform.
 *
 * Purchase/supplier invoices in Billit share the same Order model as sales
 * invoices but have OrderDirection = "Cost" and OrderType = "Invoice".
 * The CounterParty is the supplier (sending party).
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { BillitOrder } from './invoice'

// ── Status mapping ────────────────────────────────────────────────────────────

function mapBillStatus(order: BillitOrder): BillStatus {
  const status = (order.OrderStatus ?? '').toLowerCase()
  if (status === 'canceled' || status === 'credited') return 'VOIDED'
  if (status === 'paid' || order.Paid === true) return 'PAID'
  if (status === 'topay') {
    const toPay = order.ToPay ?? 0
    const total = order.TotalIncl ?? 0
    if (toPay > 0 && toPay < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  if (status === 'submitted' || status === 'invoiced') return 'SUBMITTED'
  if (status === 'draft') return 'DRAFT'
  return 'DRAFT'
}

// ── Canonical transform ───────────────────────────────────────────────────────

export function transformBill(raw: BillitOrder): Bill {
  const party = raw.CounterParty ?? raw.Supplier
  const totalIncl = raw.TotalIncl ?? 0
  const toPay = raw.ToPay ?? 0
  const paidAmount =
    raw.TotalIncl != null && (raw.Paid === true || toPay < totalIncl)
      ? totalIncl - toPay
      : undefined
  return {
    id: raw.OrderID != null ? String(raw.OrderID) : undefined,
    status: mapBillStatus(raw),
    billNumber: raw.OrderNumber || undefined,
    contactId: party?.PartyID || party?.Nr || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalIncl,
    taxAmount: raw.TotalVAT,
    paidAmount,
    balanceAmount: raw.ToPay,
    notes: raw.Comments || undefined,
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    dueAt: raw.ExpiryDate ? new Date(raw.ExpiryDate) : undefined,
    paidAt: raw.PaidDate ? new Date(raw.PaidDate) : undefined,
    createdAt: raw.Created ? new Date(raw.Created) : undefined,
    updatedAt: raw.LastModified ? new Date(raw.LastModified) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
