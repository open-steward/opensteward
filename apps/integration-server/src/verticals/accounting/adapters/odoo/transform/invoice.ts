import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface OdooInvoice {
  id: number
  name: string
  partner_id: [number, string]
  invoice_date: string
  invoice_date_due: string
  currency_id: [number, string]
  amount_total: number
  amount_residual: number
  amount_tax: number
  state: 'draft' | 'posted' | 'cancel'
  payment_state:
    | 'not_paid'
    | 'in_payment'
    | 'paid'
    | 'partial'
    | 'reversed'
    | 'invoicing_legacy'
  invoice_line_ids?: number[]
  [key: string]: unknown
}

function mapStatus(raw: OdooInvoice): InvoiceStatus {
  if (raw.state === 'draft') return 'DRAFT'
  if (raw.state === 'cancel') return 'VOIDED'
  if (raw.payment_state === 'paid') return 'PAID'
  if (raw.payment_state === 'partial') return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

export function transformInvoice(raw: OdooInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.name || undefined,
    contactId: raw.partner_id[0] !== undefined ? String(raw.partner_id[0]) : undefined,
    currency: raw.currency_id?.[1] || undefined,
    totalAmount: raw.amount_total,
    taxAmount: raw.amount_tax,
    balanceAmount: raw.amount_residual,
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.invoice_date_due ? new Date(raw.invoice_date_due) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
