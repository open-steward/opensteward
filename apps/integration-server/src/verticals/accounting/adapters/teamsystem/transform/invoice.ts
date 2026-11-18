import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface TeamSystemLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  taxAmount: number
  accountCode: string
  [key: string]: unknown
}

export interface TeamSystemInvoice {
  id: string
  documentNumber: string
  documentDate: string
  dueDate: string
  netAmount: number
  taxAmount: number
  totalAmount: number
  openAmount: number
  status: string
  currency: string
  customerId: string
  lines?: TeamSystemLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Issued': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Cancelled': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: TeamSystemLineItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.accountCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalAmount,
    taxAmount: row.taxAmount,
  }
}

export function transformInvoice(raw: TeamSystemInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.documentNumber || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount,
    balanceAmount: raw.openAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.documentDate ? new Date(raw.documentDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
