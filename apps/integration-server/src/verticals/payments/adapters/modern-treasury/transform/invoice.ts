import type { Invoice, InvoiceLineItem, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, safeInt } from './shared'

/**
 * Modern Treasury Invoice.
 *
 * Modern Treasury exposes invoices via GET /invoices and GET /invoices/{id}.
 * Line items are available via GET /invoices/{id}/invoice_line_items.
 *
 * Docs: https://docs.moderntreasury.com/platform/reference/invoices
 */
export interface RawModernTreasuryInvoice {
  id?: string
  status?: string          // 'draft' | 'unpaid' | 'paid' | 'partially_paid' | 'payment_pending' | 'voided'
  number?: string
  currency?: string
  counterparty_id?: string
  total_amount?: number    // integer minor units
  amount_paid?: number
  amount_remaining?: number
  due_date?: string
  issued_at?: string
  paid_at?: string
  voided_at?: string
  hosted_url?: string
  pdf_url?: string
  description?: string
  metadata?: Record<string, string>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export interface RawModernTreasuryInvoiceLineItem {
  id?: string
  invoice_id?: string
  name?: string
  description?: string
  quantity?: number
  unit_amount?: number     // integer minor units
  amount?: number          // integer minor units
  direction?: string
  metadata?: Record<string, string>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapInvoiceStatus(s: string | undefined | null): InvoiceStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'paid') return 'paid'
  if (v === 'voided') return 'void'
  if (v === 'draft') return 'draft'
  if (v === 'unpaid' || v === 'partially_paid' || v === 'payment_pending') return 'open'
  return 'open'
}

export function transformInvoice(raw: RawModernTreasuryInvoice): Invoice {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    number: raw.number ?? undefined,
    customerId: raw.counterparty_id ?? undefined,
    status: mapInvoiceStatus(raw.status),
    currency: pickCurrency(raw.currency),
    total: safeInt(raw.total_amount),
    amountPaid: raw.amount_paid != null ? safeInt(raw.amount_paid) : undefined,
    amountRemaining: raw.amount_remaining != null ? safeInt(raw.amount_remaining) : undefined,
    dueDate: raw.due_date ?? undefined,
    paidAt: raw.paid_at ?? undefined,
    hostedInvoiceUrl: raw.hosted_url ?? undefined,
    invoicePdfUrl: raw.pdf_url ?? undefined,
    gateway: 'modern-treasury',
    metadata: strMap(raw.metadata ?? {}),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}

export function transformInvoiceLineItem(
  raw: RawModernTreasuryInvoiceLineItem,
  invoiceId: string,
): InvoiceLineItem {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    invoiceId: raw.invoice_id ?? invoiceId,
    description: raw.name ?? raw.description ?? undefined,
    quantity: raw.quantity != null ? safeInt(raw.quantity) : undefined,
    unitAmount: raw.unit_amount != null ? safeInt(raw.unit_amount) : undefined,
    amount: safeInt(raw.amount),
    currency: pickCurrency(undefined),  // line items inherit invoice currency
    metadata: strMap(raw.metadata ?? {}),
  }
}
