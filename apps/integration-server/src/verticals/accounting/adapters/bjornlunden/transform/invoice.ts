import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface BlInvoiceLine {
  Id: string
  ArticleNumber: string
  Description: string
  Quantity: number
  UnitPrice: number
  Amount: number
  VatRate: number
  AccountNumber: number
  [key: string]: unknown
}

export interface BlInvoice {
  Id: string
  InvoiceNumber: number
  CustomerId: string
  Currency: string
  InvoiceDate: string
  DueDate: string
  TotalAmount: number
  VatAmount: number
  RemainingAmount: number
  PaidAmount: number
  Status: string
  Lines: BlInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: BlInvoice): InvoiceStatus {
  switch (raw.Status) {
    case 'Paid':
      return 'PAID'
    case 'PartiallyPaid':
      return 'PARTIALLY_PAID'
    case 'Overdue':
      return 'OVERDUE'
    case 'Cancelled':
      return 'VOIDED'
    case 'Sent':
      return 'AUTHORIZED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: BlInvoiceLine): Lineitem {
  return {
    id: row.Id || undefined,
    itemId: row.ArticleNumber || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.Amount,
    accountId: row.AccountNumber ? String(row.AccountNumber) : undefined,
  }
}

export function transformInvoice(raw: BlInvoice): Invoice {
  return {
    id: raw.Id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNumber ? String(raw.InvoiceNumber) : undefined,
    contactId: raw.CustomerId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    balanceAmount: raw.RemainingAmount,
    paidAmount: raw.PaidAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
