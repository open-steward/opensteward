/**
 * Octopus → canonical Invoice transform.
 *
 * Octopus REST API endpoint: GET /salesInvoices, GET /salesInvoices/{id}
 *
 * Key field mapping:
 *   id            ← invoiceId (number, coerced to string)
 *   invoiceNumber ← invoiceNumber
 *   contactId     ← relationId
 *   status        ← derived from paid/booked/cancelled flags
 *   totalAmount   ← totalAmount (incl. VAT)
 *   taxAmount     ← vatAmount
 *   balanceAmount ← remainingAmount / openAmount
 *   postedAt      ← invoiceDate
 *   dueAt         ← dueDate
 *   lineItems     ← lines[]
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface OctopusInvoiceLine {
  lineId?: number
  articleNumber?: string
  description?: string
  unitPrice?: number
  quantity?: number
  totalAmount?: number
  vatAmount?: number
  accountNumber?: string
  discount?: number
  [key: string]: unknown
}

export interface OctopusSalesInvoice {
  invoiceId?: number
  invoiceNumber?: string
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
  creditNote?: boolean
  reference?: string
  ourReference?: string
  notes?: string
  lines?: OctopusInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(inv: OctopusSalesInvoice): InvoiceStatus {
  if (inv.cancelled) return 'VOIDED'
  const balance = inv.remainingAmount ?? inv.openAmount ?? 0
  const total = inv.totalAmount ?? 0
  if (inv.paid || (inv.booked && balance === 0)) return 'PAID'
  if (inv.booked && balance > 0 && total > 0 && balance < total) return 'PARTIALLY_PAID'
  if (inv.booked) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(line: OctopusInvoiceLine): Lineitem {
  return {
    id: line.lineId !== undefined ? String(line.lineId) : undefined,
    accountId: line.accountNumber || undefined,
    itemId: line.articleNumber || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity !== undefined ? Math.round(line.quantity) : undefined,
    totalAmount: line.totalAmount,
    taxAmount: line.vatAmount,
    discountAmount: line.discount || undefined,
  }
}

export function transformInvoice(raw: OctopusSalesInvoice): Invoice {
  const type = raw.creditNote ? 'CREDITMEMO' : 'INVOICE'
  return {
    id: raw.invoiceId !== undefined ? String(raw.invoiceId) : undefined,
    type,
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.relationId !== undefined ? String(raw.relationId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainingAmount ?? raw.openAmount,
    paidAmount: raw.paidAmount,
    reference: raw.reference || undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
