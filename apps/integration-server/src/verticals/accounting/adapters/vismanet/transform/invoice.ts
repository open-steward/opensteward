import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface VismaNetLine {
  id: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  vatAmount?: number
  accountNumber?: string
  [key: string]: unknown
}

export interface VismaNetInvoice {
  id: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  netAmount?: number
  vatAmount?: number
  grossAmount?: number
  balance?: number
  status?: string
  currency?: string
  customerId?: string
  lines?: VismaNetLine[]
  [key: string]: unknown
}

function mapStatus(raw: VismaNetInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'Approved':
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

function mapLineitem(line: VismaNetLine): Lineitem {
  return {
    id: line.id,
    accountId: line.accountNumber || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
    taxAmount: line.vatAmount,
  }
}

export function transformInvoice(raw: VismaNetInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.balance,
    lineItems: (raw.lines ?? []).map(mapLineitem),
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
    lines: invoice.lineItems?.map((li) => ({
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unitPrice: li.unitAmount,
      accountNumber: li.accountId,
    })),
  }
}
