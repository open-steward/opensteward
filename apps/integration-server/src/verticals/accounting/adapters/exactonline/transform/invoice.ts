import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ExactInvoiceLine {
  Item: string
  Description: string
  Quantity: number
  UnitPrice: number
  AmountDC: number
  VATAmountDC: number
}

export interface ExactInvoice {
  InvoiceID: string
  InvoiceNumber: number
  OrderedBy: string
  InvoiceDate: string
  DueDate: string
  Currency: string
  AmountDC: number
  VATAmountDC: number
  Status: number
  InvoiceLines?: { results?: ExactInvoiceLine[] }
  [key: string]: unknown
}

function mapStatus(raw: ExactInvoice): InvoiceStatus {
  switch (raw.Status) {
    case 10:
      return 'DRAFT'
    case 20:
      return 'AUTHORIZED'
    case 50:
      return 'PAID'
    case 60:
      return 'VOIDED'
    default:
      return 'AUTHORIZED'
  }
}

function mapLineitem(line: ExactInvoiceLine): Lineitem {
  return {
    itemId: line.Item || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    taxAmount: line.VATAmountDC,
    totalAmount: line.AmountDC,
  }
}

export function transformInvoice(raw: ExactInvoice): Invoice {
  return {
    id: raw.InvoiceID,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: String(raw.InvoiceNumber),
    contactId: raw.OrderedBy || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.AmountDC,
    taxAmount: raw.VATAmountDC,
    lineItems: (raw.InvoiceLines?.results ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
