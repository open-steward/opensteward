import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AccountsIQInvoiceLine {
  lineId: string | number
  description: string
  quantity: number
  unitPrice: number
  lineAmount: number
  taxAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface AccountsIQInvoice {
  invoiceId: string | number
  entityId: string | number
  status: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  totalAmount: number
  taxAmount: number
  currency: string
  contactId: string | number
  lines: AccountsIQInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Posted':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AccountsIQInvoiceLine): Lineitem {
  return {
    id: String(line.lineId),
    accountId: line.accountCode || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.lineAmount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformInvoice(raw: AccountsIQInvoice): Invoice {
  return {
    id: String(raw.invoiceId),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.contactId ? String(raw.contactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
