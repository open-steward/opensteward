/**
 * Tipalti does not have a first-party AR invoice concept.
 * Tipalti's "invoices" are AP bills (payee-submitted documents).
 *
 * We map Tipalti invoices → canonical Bill (see bill.ts).
 * For the canonical Invoice type we re-use the same wire type but
 * represent it as type='BILL' so downstream consumers know the directionality.
 *
 * REST endpoint: GET /v1/invoices
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import type { TipaltiInvoice, TipaltiInvoiceLine } from './bill'

export type { TipaltiInvoice, TipaltiInvoiceLine }

const TIPALTI_INVOICE_STATUS_MAP: Record<string, InvoiceStatus> = {
  PENDING: 'SUBMITTED',
  PENDING_APPROVAL: 'SUBMITTED',
  APPROVED: 'AUTHORIZED',
  PROCESSING: 'AUTHORIZED',
  PAID: 'PAID',
  DECLINED: 'VOIDED',
  CANCELLED: 'VOIDED',
  DUPLICATE: 'DELETED',
}

function mapStatus(raw: TipaltiInvoice): InvoiceStatus {
  if (raw.status) {
    const mapped = TIPALTI_INVOICE_STATUS_MAP[raw.status.toUpperCase()]
    if (mapped) return mapped
  }
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

export function transformInvoice(raw: TipaltiInvoice): Invoice {
  return {
    id: raw.id,
    type: 'BILL',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
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
