/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Primary API is XML-based; REST API availability unconfirmed.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface SzamlazzhuInvoice {
  id: string | number
  invoiceNumber: string
  issueDate: string
  paymentDate?: string
  grossTotal: number
  vatTotal?: number
  status?: string
  partnerId?: string | number
  currency?: string
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch (status) {
    case 'ISSUED': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'STORNO': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: SzamlazzhuInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.partnerId != null ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossTotal,
    taxAmount: raw.vatTotal,
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.paymentDate ? new Date(raw.paymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
