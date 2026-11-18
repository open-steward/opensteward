import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MyobInvoiceLine {
  RowID: number
  Description: string
  Units: number
  UnitPrice: number
  Total: number
  TaxAmount: number
  Account: { UID: string; DisplayID: string } | null
}

export interface MyobInvoice {
  UID: string
  Number: string
  Customer: { UID: string; Name: string } | null
  Date: string
  DueDate: string
  IsTaxInclusive: boolean
  TotalTax: number
  TotalAmount: number
  BalanceDueAmount: number
  Status: 'Open' | 'Closed' | 'CreditApplied'
  Lines?: MyobInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: MyobInvoice): InvoiceStatus {
  if (raw.Status === 'CreditApplied') return 'VOIDED'
  if (raw.Status === 'Closed') return 'PAID'
  if (raw.Status === 'Open' && raw.BalanceDueAmount < raw.TotalAmount) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLineitem(line: MyobInvoiceLine): Lineitem {
  return {
    id: String(line.RowID),
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Units,
    taxAmount: line.TaxAmount,
    totalAmount: line.Total,
    accountId: line.Account?.UID || undefined,
  }
}

export function transformInvoice(raw: MyobInvoice): Invoice {
  return {
    id: raw.UID,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.Number || undefined,
    contactId: raw.Customer?.UID || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TotalTax,
    balanceAmount: raw.BalanceDueAmount,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
