import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ProsvasisInvoiceLine {
  Id: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  VatAmount: number
  AccountCode: string
  Discount: number
  [key: string]: unknown
}

export interface ProsvasisInvoice {
  id: string | number
  SeriesNumber: string
  Status: string
  IssueDate: string
  DueDate: string
  TotalAmount: number
  VatAmount: number
  Currency: string
  CustomerId: string | number
  Lines: ProsvasisInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Issued':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Cancelled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: ProsvasisInvoiceLine): Lineitem {
  return {
    id: String(line.Id),
    accountId: line.AccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.VatAmount || undefined,
    discountAmount: line.Discount || undefined,
  }
}

export function transformInvoice(raw: ProsvasisInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.SeriesNumber || undefined,
    contactId: raw.CustomerId ? String(raw.CustomerId) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.IssueDate ? new Date(raw.IssueDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
