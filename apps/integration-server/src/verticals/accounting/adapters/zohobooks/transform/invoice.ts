import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface ZohoBooksInvoice {
  invoice_id: string
  invoice_number: string
  customer_id: string
  customer_name: string
  date: string
  due_date: string
  currency_code: string
  total: number
  balance: number
  tax_total: number
  status: 'draft' | 'sent' | 'overdue' | 'paid' | 'void' | 'partially_paid' | 'viewed' | 'accepted'
  line_items?: Array<{
    line_item_id: string
    item_id: string
    description: string
    rate: number
    quantity: number
    item_total: number
    tax_amount: number
    account_id: string
  }>
  [key: string]: unknown
}

function mapStatus(raw: ZohoBooksInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'draft': return 'DRAFT'
    case 'sent':
    case 'viewed':
    case 'accepted': return 'AUTHORIZED'
    case 'overdue': return 'OVERDUE'
    case 'partially_paid': return 'PARTIALLY_PAID'
    case 'paid': return 'PAID'
    case 'void': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: ZohoBooksInvoice): Invoice {
  return {
    id: raw.invoice_id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    balanceAmount: raw.balance,
    paidAmount: raw.total - raw.balance || undefined,
    taxAmount: raw.tax_total,
    lineItems: (raw.line_items ?? []).map((li) => ({
      id: li.line_item_id || undefined,
      itemId: li.item_id || undefined,
      itemDescription: li.description || undefined,
      unitAmount: li.rate,
      unitQuantity: li.quantity,
      totalAmount: li.item_total,
      taxAmount: li.tax_amount || undefined,
      accountId: li.account_id || undefined,
    })),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
