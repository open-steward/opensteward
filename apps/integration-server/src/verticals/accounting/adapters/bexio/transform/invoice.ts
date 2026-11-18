import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BexioInvoicePosition {
  id: string
  article_id: string
  text: string
  amount: number
  unit_price: number
  position_total: number
  tax_id: string
  tax_value: number
  account_id: string
  [key: string]: unknown
}

export interface BexioInvoice {
  id: number
  document_nr: string
  contact_id: number
  currency_id: number
  currency_code: string
  is_valid_from: string
  is_valid_to: string
  kb_item_status: string
  total_gross: number
  total_taxes: number
  total_remaining_payments: number
  total_received_payments: number
  positions: BexioInvoicePosition[]
  [key: string]: unknown
}

function mapStatus(raw: BexioInvoice): InvoiceStatus {
  switch (raw.kb_item_status) {
    case 'draft':
      return 'DRAFT'
    case 'pending':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: BexioInvoicePosition): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    itemId: row.article_id ? String(row.article_id) : undefined,
    itemDescription: row.text || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.amount,
    totalAmount: row.position_total,
    taxAmount: row.tax_value || undefined,
    taxrateId: row.tax_id ? String(row.tax_id) : undefined,
  }
}

export function transformInvoice(raw: BexioInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.document_nr || undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total_gross,
    taxAmount: raw.total_taxes,
    balanceAmount: raw.total_remaining_payments,
    paidAmount: raw.total_received_payments || undefined,
    lineItems: (raw.positions ?? []).map(mapLineitem),
    postedAt: raw.is_valid_from ? new Date(raw.is_valid_from) : undefined,
    dueAt: raw.is_valid_to ? new Date(raw.is_valid_to) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
