/**
 * Octopus → canonical Bill transform.
 *
 * Octopus REST API endpoint: GET /purchaseInvoices, GET /purchaseInvoices/{id}
 *
 * Purchase invoices (leveranciersfacturen) are the payables side of
 * the Octopus accounting ledger.
 */

import type { Bill, BillStatus } from '../../../schema/bill'

export interface OctopusPurchaseInvoice {
  purchaseInvoiceId?: number
  invoiceNumber?: string
  supplierInvoiceNumber?: string
  relationId?: number
  relationName?: string
  invoiceDate?: string
  dueDate?: string
  currency?: string
  totalAmount?: number
  vatAmount?: number
  remainingAmount?: number
  openAmount?: number
  paidAmount?: number
  paid?: boolean
  booked?: boolean
  cancelled?: boolean
  notes?: string
  reference?: string
  [key: string]: unknown
}

function mapStatus(inv: OctopusPurchaseInvoice): BillStatus {
  if (inv.cancelled) return 'VOIDED'
  const balance = inv.remainingAmount ?? inv.openAmount ?? 0
  const total = inv.totalAmount ?? 0
  if (inv.paid || (inv.booked && balance === 0)) return 'PAID'
  if (inv.booked && balance > 0 && total > 0 && balance < total) return 'PARTIALLY_PAID'
  if (inv.booked) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: OctopusPurchaseInvoice): Bill {
  return {
    id: raw.purchaseInvoiceId !== undefined ? String(raw.purchaseInvoiceId) : undefined,
    status: mapStatus(raw),
    billNumber: raw.supplierInvoiceNumber || raw.invoiceNumber || undefined,
    contactId: raw.relationId !== undefined ? String(raw.relationId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainingAmount ?? raw.openAmount,
    paidAmount: raw.paidAmount,
    notes: raw.notes || undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
