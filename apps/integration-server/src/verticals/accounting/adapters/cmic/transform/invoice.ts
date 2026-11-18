import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface CmicInvoiceLine {
  LineId: string
  Description: string
  Quantity: number
  UnitPrice: number
  LineAmount: number
  TaxAmount: number
  AccountCode: string
  CostCode: string
  [key: string]: unknown
}

export interface CmicInvoice {
  InvoiceId: string
  InvoiceNumber: string
  Status: string
  SubcontractorId: string
  ProjectCode: string
  Currency: string
  Amount: number
  TaxAmount: number
  InvoiceDate: string
  DueDate: string
  Lines: CmicInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Void':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: CmicInvoiceLine): Lineitem {
  return {
    id: line.LineId,
    accountId: line.AccountCode || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.LineAmount,
    taxAmount: line.TaxAmount || undefined,
  }
}

export function transformInvoice(raw: CmicInvoice): Invoice {
  return {
    id: String(raw.InvoiceId),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.SubcontractorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.TaxAmount || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
