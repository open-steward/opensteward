import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ReckonInvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitAmount: number
  amount: number
  taxAmount: number
  accountId: string
  accountName: string
  taxCodeId: string
  discountAmount: number
  [key: string]: unknown
}

export interface ReckonInvoice {
  id: string
  invoiceNumber: string
  date: string
  dueDate: string
  totalAmount: number
  totalTax: number
  balance: number
  subTotal: number
  currencyCode: string
  contactId: string
  contactName: string
  status: string
  lineItems: ReckonInvoiceLineItem[]
  reference: string
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status?.toUpperCase()) {
    case 'DRAFT':
      return 'DRAFT'
    case 'OPEN':
      return 'AUTHORIZED'
    case 'PARTIAL':
      return 'PARTIALLY_PAID'
    case 'PAID':
      return 'PAID'
    case 'VOID':
      return 'VOIDED'
    case 'OVERDUE':
      return 'OVERDUE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: ReckonInvoiceLineItem): Lineitem {
  return {
    id: item.id || undefined,
    accountId: item.accountId || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unitAmount,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
    taxAmount: item.taxAmount || undefined,
    taxrateId: item.taxCodeId || undefined,
    discountAmount: item.discountAmount || undefined,
  }
}

export function transformInvoice(raw: ReckonInvoice): Invoice {
  const status = mapStatus(raw.status)
  const paidAmount = raw.totalAmount != null && raw.balance != null
    ? raw.totalAmount - raw.balance
    : undefined

  return {
    id: raw.id,
    type: 'INVOICE',
    status,
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.totalTax || undefined,
    balanceAmount: raw.balance,
    paidAmount: paidAmount && paidAmount > 0 ? paidAmount : undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
