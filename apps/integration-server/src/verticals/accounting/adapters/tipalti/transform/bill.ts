/**
 * Tipalti invoice → canonical Bill transform.
 *
 * In Tipalti, "invoices" are AP bills submitted by payees for payment.
 * REST endpoint: GET /v1/invoices
 *
 * Tipalti invoice fields (snake_case on the wire):
 *   id, status, invoiceNumber, payeeId, currency,
 *   totalAmount, paidAmount, dueDate, invoiceDate,
 *   description, lines[{lineNumber, description, quantity, unitPrice, totalAmount}]
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

// ── Wire types ────────────────────────────────────────────────────────────────

export interface TipaltiInvoiceLine {
  lineNumber?: number
  description?: string
  quantity?: number
  unitPrice?: number
  totalAmount?: number
  glAccountId?: string
}

export interface TipaltiInvoice {
  id: string
  status?: string
  invoiceNumber?: string
  payeeId?: string
  currency?: string
  totalAmount?: number
  paidAmount?: number
  balanceAmount?: number
  description?: string
  invoiceDate?: string
  dueDate?: string
  paidDate?: string
  createdAt?: string
  updatedAt?: string
  lines?: TipaltiInvoiceLine[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

const TIPALTI_BILL_STATUS_MAP: Record<string, BillStatus> = {
  PENDING: 'SUBMITTED',
  PENDING_APPROVAL: 'SUBMITTED',
  APPROVED: 'AUTHORIZED',
  PROCESSING: 'AUTHORIZED',
  PAID: 'PAID',
  DECLINED: 'VOIDED',
  CANCELLED: 'VOIDED',
  DUPLICATE: 'DELETED',
}

function mapStatus(raw: TipaltiInvoice): BillStatus {
  if (raw.status) {
    const mapped = TIPALTI_BILL_STATUS_MAP[raw.status.toUpperCase()]
    if (mapped) return mapped
  }
  // Derive from amounts if status unavailable
  const total = raw.totalAmount ?? 0
  const paid = raw.paidAmount ?? 0
  if (total > 0 && paid >= total) return 'PAID'
  if (paid > 0 && paid < total) return 'PARTIALLY_PAID'
  if (raw.dueDate && new Date(raw.dueDate).getTime() < Date.now()) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLines(lines: TipaltiInvoiceLine[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.lineNumber !== undefined ? String(l.lineNumber) : undefined,
    accountId: l.glAccountId || undefined,
    itemDescription: l.description || undefined,
    unitAmount: l.unitPrice,
    unitQuantity: l.quantity !== undefined ? Math.round(l.quantity) : undefined,
    totalAmount: l.totalAmount,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBill(raw: TipaltiInvoice): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.payeeId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    paidAmount: raw.paidAmount,
    balanceAmount: raw.balanceAmount,
    notes: raw.description || undefined,
    lineItems: raw.lines ? mapLines(raw.lines) : undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    paidAt: raw.paidDate ? new Date(raw.paidDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
