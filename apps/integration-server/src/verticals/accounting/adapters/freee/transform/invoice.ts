import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FreeeInvoiceContent {
  id: number
  name: string
  quantity: number
  unit_price: number
  amount: number
  vat_rate: number
  account_item_id: number | null
  account_item_name: string | null
  [key: string]: unknown
}

export interface FreeeInvoice {
  id: number
  invoice_number: string
  issue_date: string
  due_date: string
  total_amount_with_vat: number
  total_vat_amount: number
  payment_status: string
  partner_id: number | null
  partner_name: string | null
  invoice_contents: FreeeInvoiceContent[]
  [key: string]: unknown
}

function mapStatus(payment_status: string, _issue_date: string): InvoiceStatus {
  if (payment_status === 'settled') return 'PAID'
  if (payment_status === 'unsettled') return 'AUTHORIZED'
  if (payment_status === 'empty') return 'DRAFT'
  if (payment_status === 'issue_date_not_arrived') return 'DRAFT'
  // fallback: treat unknown statuses as DRAFT
  return 'DRAFT'
}

function mapLineitem(row: FreeeInvoiceContent): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_item_id ? String(row.account_item_id) : undefined,
    itemDescription: row.name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.vat_rate ? (row.amount * row.vat_rate) / (100 + row.vat_rate) : undefined,
  }
}

export function transformInvoice(raw: FreeeInvoice): Invoice {
  const balanceAmount = raw.total_amount_with_vat - raw.total_vat_amount
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.payment_status as string, raw.issue_date as string),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.partner_id ? String(raw.partner_id) : undefined,
    totalAmount: raw.total_amount_with_vat,
    taxAmount: raw.total_vat_amount,
    balanceAmount,
    lineItems: (raw.invoice_contents ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
