/**
 * Billit Order (OrderType = "CreditNote") → canonical CreditMemo transform.
 *
 * Credit notes in Billit share the same Order model as regular invoices but
 * have OrderType = "CreditNote". They are retrieved from GET /v1/orders with
 * an OData filter on OrderType.
 *
 * Amounts in Billit credit-note JSON stay positive even though they represent
 * negative values on the PDF (documented platform behaviour).
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { BillitOrder } from './invoice'

// ── Status mapping ────────────────────────────────────────────────────────────

function mapCreditMemoStatus(order: BillitOrder): CreditMemoStatus {
  const status = (order.OrderStatus ?? '').toLowerCase()
  if (status === 'canceled') return 'VOIDED'
  if (status === 'paid' || order.Paid === true) return 'PAID'
  if (status === 'topay') {
    const toPay = order.ToPay ?? 0
    const total = order.TotalIncl ?? 0
    if (toPay > 0 && toPay < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  if (status === 'tosend' || status === 'sent' || status === 'invoiced') return 'AUTHORIZED'
  if (status === 'draft') return 'DRAFT'
  return 'DRAFT'
}

// ── Canonical transform ───────────────────────────────────────────────────────

export function transformCreditMemo(raw: BillitOrder): CreditMemo {
  const party = raw.CounterParty ?? raw.Customer
  const totalIncl = raw.TotalIncl ?? 0
  const toPay = raw.ToPay ?? 0
  const paidAmount =
    raw.TotalIncl != null && (raw.Paid === true || toPay < totalIncl)
      ? totalIncl - toPay
      : undefined
  return {
    id: raw.OrderID != null ? String(raw.OrderID) : undefined,
    status: mapCreditMemoStatus(raw),
    creditmemoNumber: raw.OrderNumber || undefined,
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
