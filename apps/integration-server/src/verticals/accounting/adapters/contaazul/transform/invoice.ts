import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ContaAzulInvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string
  product_id: string
  discount: number
  [key: string]: unknown
}

export interface ContaAzulInvoice {
  id: string
  number: string
  issue_date: string
  due_date: string
  customer_id: string
  total: number
  tax_total: number
  balance: number
  paid_amount: number
  currency: string
  status: string
  reference: string
  items: ContaAzulInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(raw: ContaAzulInvoice): InvoiceStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'voided' || s === 'cancelled') return 'VOIDED'
  if (s === 'paid' || s === 'liquidated') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'confirmed') return 'AUTHORIZED'
  if (s === 'overdue') return 'OVERDUE'
  return 'DRAFT'
}

function mapLineitem(row: ContaAzulInvoiceItem): Lineitem {
  return {
    id: row.id || undefined,
    accountId: row.account_id || undefined,
    itemId: row.product_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax_amount || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformInvoice(raw: ContaAzulInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.customer_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax_total,
    balanceAmount: raw.balance,
    paidAmount: raw.paid_amount || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customer_id: invoice.contactId,
    currency: invoice.currency,
    issue_date: toCalendarDate(invoice.postedAt),
    due_date: toCalendarDate(invoice.dueAt),
    reference: invoice.reference,
    items: invoice.lineItems?.map((li) => ({
      product_id: li.itemId,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
