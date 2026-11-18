import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface VismaBusinessNxtLine {
  id: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  taxAmount?: number
  accountNumber?: string
  [key: string]: unknown
}

export interface VismaBusinessNxtInvoice {
  id: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  netAmount?: number
  taxAmount?: number
  grossAmount?: number
  outstandingAmount?: number
  status?: string
  currency?: string
  customerId?: string
  lineItems?: VismaBusinessNxtLine[]
  [key: string]: unknown
}

function mapStatus(raw: VismaBusinessNxtInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'Open':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: VismaBusinessNxtLine): Lineitem {
  return {
    id: line.id,
    accountId: line.accountNumber || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
    taxAmount: line.taxAmount,
  }
}

export function transformInvoice(raw: VismaBusinessNxtInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.outstandingAmount,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customerId: invoice.contactId,
    currency: invoice.currency,
    invoiceDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    lineItems: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unitPrice: li.unitAmount,
      accountNumber: li.accountId,
    })),
  }
}
