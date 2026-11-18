import { toCalendarDate } from '../../shared/transform'
/**
 * KLARA invoice transform.
 *
 * KLARA invoice resource fields (snake_case REST API):
 *   id, invoice_number, status, contact_id, currency, total_amount,
 *   tax_amount, discount_amount, paid_amount, balance_amount,
 *   invoice_date, due_date, paid_date, notes, positions[]
 *
 * Position fields: id, article_id, description, quantity, unit_price,
 *   total_price, tax_rate_id, account_id
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface KlaraInvoicePosition {
  id: string
  article_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  tax_rate_id?: string
  account_id?: string
  [key: string]: unknown
}

export interface KlaraInvoice {
  id: string
  invoice_number?: string
  status?: string
  contact_id?: string
  currency?: string
  total_amount?: number
  tax_amount?: number
  discount_amount?: number
  paid_amount?: number
  balance_amount?: number
  invoice_date?: string
  due_date?: string
  paid_date?: string
  created_at?: string
  updated_at?: string
  notes?: string
  positions?: KlaraInvoicePosition[]
  [key: string]: unknown
}

function mapStatus(raw: KlaraInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'draft':
      return 'DRAFT'
    case 'sent':
    case 'open':
    case 'pending':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'partial':
    case 'partially_paid':
      return 'PARTIALLY_PAID'
    case 'overdue':
      return 'OVERDUE'
    case 'cancelled':
    case 'voided':
      return 'VOIDED'
    default: {
      // Derive from balance if status is absent/unknown
      const balance = raw.balance_amount ?? 0
      const total = raw.total_amount ?? 0
      if (balance === 0 && total > 0) return 'PAID'
      if (balance > 0 && balance < total) return 'PARTIALLY_PAID'
      if (raw.due_date && new Date(raw.due_date).getTime() < Date.now() && balance > 0)
        return 'OVERDUE'
      return 'AUTHORIZED'
    }
  }
}

function mapPositions(positions: KlaraInvoicePosition[]): Lineitem[] {
  return positions.map((p) => ({
    id: p.id || undefined,
    accountId: p.account_id || undefined,
    itemId: p.article_id || undefined,
    itemDescription: p.description || undefined,
    unitAmount: p.unit_price,
    unitQuantity: p.quantity != null ? Math.round(p.quantity) : undefined,
    totalAmount: p.total_price,
    taxrateId: p.tax_rate_id || undefined,
  }))
}

export function transformInvoice(raw: KlaraInvoice): Invoice {
  return {
    id: raw.id || undefined,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    discountAmount: raw.discount_amount,
    paidAmount: raw.paid_amount,
    balanceAmount: raw.balance_amount,
    notes: raw.notes || undefined,
    lineItems: (raw.positions ?? []).length > 0 ? mapPositions(raw.positions ?? []) : undefined,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    paidAt: raw.paid_date ? new Date(raw.paid_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    contact_id: invoice.contactId,
    currency: invoice.currency,
    invoice_date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    invoice_number: invoice.invoiceNumber,
    notes: invoice.notes,
    positions: invoice.lineItems?.map((li) => ({
      article_id: li.itemId,
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unit_price: li.unitAmount,
      total_price: li.totalAmount,
      account_id: li.accountId,
      tax_rate_id: li.taxrateId,
    })),
  }
}
