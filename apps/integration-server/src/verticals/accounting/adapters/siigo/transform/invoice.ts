import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface SiigoInvoiceItem {
  id: number
  description: string
  quantity: number
  price: number
  total: number
  taxAmount: number
  accountId: number
  productId: string
  discount: number
  [key: string]: unknown
}

export interface SiigoInvoice {
  id: number
  prefix: string
  number: number
  name: string
  date: string
  dueDate: string
  customerId: number
  total: number
  taxTotal: number
  balance: number
  paidAmount: number
  currency: string
  status: string
  items: SiigoInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(raw: SiigoInvoice): InvoiceStatus {
  const s = (raw.status || '').toLowerCase()
  if (s === 'voided' || s === 'annulled') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'authorized' || s === 'approved') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: SiigoInvoiceItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountId ? String(row.accountId) : undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.price,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.taxAmount || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformInvoice(raw: SiigoInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.prefix ? `${raw.prefix}-${raw.number}` : String(raw.number),
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    balanceAmount: raw.balance,
    paidAmount: raw.paidAmount || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customerId: invoice.contactId ? Number(invoice.contactId) : undefined,
    currency: invoice.currency,
    date: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    reference: invoice.reference,
    items: invoice.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      price: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
