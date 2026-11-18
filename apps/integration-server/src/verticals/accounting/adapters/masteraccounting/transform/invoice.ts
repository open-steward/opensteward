import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MasteraccountingInvoiceLine {
  id: string
  description?: string
  unitPrice: number
  quantity: number
  amount: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface MasteraccountingInvoice {
  id: string
  number: string
  date: string
  dueDate?: string
  totalSum: number
  taxSum?: number
  status: string
  partnerId?: string
  currency?: string
  lines?: MasteraccountingInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'APPROVED':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    case 'DRAFT':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: MasteraccountingInvoiceLine): Lineitem {
  return {
    id: String(line.id),
    accountId: line.accountId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitPrice,
    unitQuantity: line.quantity,
    totalAmount: line.amount,
    taxAmount: line.taxAmount || undefined,
  }
}

export function transformInvoice(raw: MasteraccountingInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number || undefined,
    contactId: raw.partnerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalSum,
    taxAmount: raw.taxSum || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
