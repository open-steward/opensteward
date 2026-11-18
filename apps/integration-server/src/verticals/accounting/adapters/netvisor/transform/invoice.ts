import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface NetvisorInvoiceLine {
  NetvisorKey: number
  ProductIdentifier: string
  ProductName: string
  Quantity: number
  UnitPrice: number
  LineSum: number
  VatPercent: number
  AccountNumber: string
  [key: string]: unknown
}

export interface NetvisorInvoice {
  NetvisorKey: number
  InvoiceNumber: number
  InvoiceCustomerIdentifier: string
  InvoiceCurrency: string
  InvoiceDate: string
  InvoiceDueDate: string
  InvoiceAmount: number
  InvoiceVatAmount: number
  InvoiceOpenAmount: number
  InvoicePaidAmount: number
  InvoiceStatus: string
  InvoiceLines: NetvisorInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: NetvisorInvoice): InvoiceStatus {
  switch (raw.InvoiceStatus) {
    case 'Paid':
      return 'PAID'
    case 'Unsent':
      return 'DRAFT'
    case 'Credited':
      return 'VOIDED'
    case 'Open':
    case 'Overdue':
      return 'AUTHORIZED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: NetvisorInvoiceLine): Lineitem {
  return {
    id: String(row.NetvisorKey),
    itemId: row.ProductIdentifier || undefined,
    itemDescription: row.ProductName || undefined,
    unitQuantity: row.Quantity,
    unitAmount: row.UnitPrice,
    totalAmount: row.LineSum,
    accountId: row.AccountNumber || undefined,
  }
}

export function transformInvoice(raw: NetvisorInvoice): Invoice {
  return {
    id: String(raw.NetvisorKey),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNumber ? String(raw.InvoiceNumber) : undefined,
    contactId: raw.InvoiceCustomerIdentifier || undefined,
    currency: raw.InvoiceCurrency || undefined,
    totalAmount: raw.InvoiceAmount,
    taxAmount: raw.InvoiceVatAmount,
    balanceAmount: raw.InvoiceOpenAmount,
    paidAmount: raw.InvoicePaidAmount || undefined,
    lineItems: (raw.InvoiceLines ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.InvoiceDueDate ? new Date(raw.InvoiceDueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
