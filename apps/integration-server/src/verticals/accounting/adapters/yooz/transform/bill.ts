/**
 * Transform a Yooz Rising document record into a canonical Bill.
 *
 * Yooz documents represent supplier invoices / AP bills flowing through the
 * AP automation pipeline. Key fields come from the document metadata object
 * returned by GET /documents and GET /documents/{id}.
 *
 * Status mapping:
 *   CANCELLED / REJECTED → VOIDED
 *   PAID                 → PAID
 *   PARTIALLY_PAID       → PARTIALLY_PAID
 *   VALIDATED / APPROVED → AUTHORIZED
 *   SUBMITTED / PENDING  → SUBMITTED
 *   *                    → DRAFT
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

// ── Yooz document line item ───────────────────────────────────────────────────

export interface YoozDocumentLine {
  id?: string | number
  description?: string
  quantity?: number
  unitPrice?: number | string
  totalAmount?: number | string
  taxAmount?: number | string
  taxRate?: number | string
  accountCode?: string
  [key: string]: unknown
}

// ── Yooz document (AP invoice / bill) ────────────────────────────────────────

export interface YoozDocument {
  id?: string | number
  documentNumber?: string
  invoiceNumber?: string
  supplierId?: string | number
  supplierName?: string
  currency?: string
  totalAmount?: number | string
  taxAmount?: number | string
  netAmount?: number | string
  remainingAmount?: number | string
  status?: string
  documentDate?: string
  dueDate?: string
  paymentDate?: string
  poNumber?: string
  notes?: string
  lines?: YoozDocumentLine[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(status: string | undefined): BillStatus {
  if (!status) return 'DRAFT'
  const s = status.toUpperCase()
  if (s.includes('CANCEL') || s.includes('REJECT')) return 'VOIDED'
  if (s === 'PAID') return 'PAID'
  if (s.includes('PARTIAL')) return 'PARTIALLY_PAID'
  if (s === 'VALIDATED' || s === 'APPROVED' || s === 'AUTHORIZED') return 'AUTHORIZED'
  if (s === 'SUBMITTED' || s === 'PENDING_APPROVAL' || s === 'PENDING') return 'SUBMITTED'
  return 'DRAFT'
}

// ── Amount coercion ───────────────────────────────────────────────────────────

function toNum(v: number | string | undefined | null): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(v as string)
  return isNaN(n) ? undefined : n
}

// ── Line item mapping ─────────────────────────────────────────────────────────

function mapLine(line: YoozDocumentLine): Lineitem {
  return {
    id: line.id !== undefined ? String(line.id) : undefined,
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: toNum(line.unitPrice),
    unitQuantity: line.quantity !== undefined ? Math.round(line.quantity) : undefined,
    totalAmount: toNum(line.totalAmount),
    taxAmount: toNum(line.taxAmount),
  }
}

// ── Main transform ────────────────────────────────────────────────────────────

export function transformBill(raw: YoozDocument): Bill {
  const id = raw.id !== undefined ? String(raw.id) : undefined
  const billNumber = raw.invoiceNumber || raw.documentNumber || undefined

  return {
    id,
    status: mapStatus(raw.status),
    billNumber,
    contactId: raw.supplierId !== undefined ? String(raw.supplierId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: toNum(raw.totalAmount),
    taxAmount: toNum(raw.taxAmount),
    balanceAmount: toNum(raw.remainingAmount),
    notes: raw.notes || undefined,
    lineItems: raw.lines?.length ? raw.lines.map(mapLine) : undefined,
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    paidAt: raw.paymentDate ? new Date(raw.paymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
