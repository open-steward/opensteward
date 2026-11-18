import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AlegraInvoiceItem {
  id: number
  description: string
  quantity: number
  price: number
  total: number
  tax: number
  accountId: number
  productId: string
  discount: number
  [key: string]: unknown
}

export interface AlegraInvoice {
  id: number
  numberTemplate: { number: string; prefix: string }
  date: string
  dueDate: string
  clientId: number
  total: number
  totalTax: number
  balance: number
  paidAmount: number
  currency: string
  status: string
  observations: string
  items: AlegraInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(raw: AlegraInvoice): InvoiceStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'open' || s === 'authorized') return 'AUTHORIZED'
  if (s === 'overdue') return 'OVERDUE'
  return 'DRAFT'
}

function mapLineitem(row: AlegraInvoiceItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformInvoice(raw: AlegraInvoice): Invoice {
  const number = raw.numberTemplate
    ? `${raw.numberTemplate.prefix || ''}${raw.numberTemplate.number}`
    : undefined

  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: number,
    contactId: raw.clientId ? String(raw.clientId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.totalTax,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    notes: raw.observations || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    clientId: invoice.contactId ? Number(invoice.contactId) : undefined,
    currency: invoice.currency,
    date: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    observations: invoice.notes,
    items: invoice.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
