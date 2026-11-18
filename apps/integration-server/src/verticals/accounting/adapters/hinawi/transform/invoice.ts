import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface HinawiLineItem {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  Total: number
  TaxAmount: number
  AccountId: string | number
  [key: string]: unknown
}

export interface HinawiInvoice {
  id: string | number
  InvoiceNo: string
  InvoiceDate: string
  DueDate: string
  SubTotal: number
  TaxAmount: number
  Total: number
  Balance: number
  Status: string
  CustomerId: string | number
  Currency: string
  LineItems: HinawiLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Open':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: HinawiLineItem): Lineitem {
  return {
    id: String(item.Id),
    accountId: item.AccountId ? String(item.AccountId) : undefined,
    itemDescription: item.Description || undefined,
    unitAmount: item.UnitPrice,
    unitQuantity: item.Quantity,
    totalAmount: item.Total,
    taxAmount: item.TaxAmount || undefined,
  }
}

export function transformInvoice(raw: HinawiInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.InvoiceNo || undefined,
    contactId: raw.CustomerId ? String(raw.CustomerId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    taxAmount: raw.TaxAmount,
    balanceAmount: raw.Balance,
    lineItems: (raw.LineItems ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
