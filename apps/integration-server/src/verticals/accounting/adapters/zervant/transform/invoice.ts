import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ZervantRow {
  id: string
  description?: string
  quantity?: number
  unitPrice?: number
  total?: number
  taxAmount?: number
  accountCode?: string
  [key: string]: unknown
}

export interface ZervantInvoice {
  id: string
  number?: string
  date?: string
  dueDate?: string
  subtotal?: number
  taxTotal?: number
  total?: number
  amountDue?: number
  status?: string
  currency?: string
  contactId?: string
  rows?: ZervantRow[]
  [key: string]: unknown
}

function mapStatus(raw: ZervantInvoice): InvoiceStatus {
  switch (raw.status?.toUpperCase()) {
    case 'SENT':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: ZervantRow): Lineitem {
  return {
    id: row.id,
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformInvoice(raw: ZervantInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    balanceAmount: raw.amountDue,
    lineItems: (raw.rows ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    contactId: invoice.contactId,
    currency: invoice.currency,
    date: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    rows: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unitPrice: li.unitAmount,
      accountCode: li.accountId,
    })),
  }
}
