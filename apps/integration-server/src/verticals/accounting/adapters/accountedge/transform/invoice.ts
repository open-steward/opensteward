/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AccountEdgeLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string
  [key: string]: unknown
}

export interface AccountEdgeInvoice {
  id: string
  invoice_number: string
  contact_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  amount_paid: number
  line_items: AccountEdgeLineItem[]
  date: string
  due_date: string
  status: string
  [key: string]: unknown
}

function mapStatus(inv: AccountEdgeInvoice): InvoiceStatus {
  const s = inv.status?.toLowerCase() ?? ''
  if (s === 'void') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'approved') return 'AUTHORIZED'
  if (s === 'draft') return 'DRAFT'
  return 'SUBMITTED'
}

function mapLineitem(row: AccountEdgeLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.tax_amount || undefined,
  }
}

export function transformInvoice(raw: AccountEdgeInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_amount,
    paidAmount: raw.amount_paid || undefined,
    balanceAmount: raw.total - (raw.amount_paid ?? 0),
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
