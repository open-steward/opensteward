import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ManagerioInvoiceLine {
  Item: string
  Description: string
  Qty: number
  UnitPrice: number
  LineTotal: number
  Tax: string
  TaxAmount: number
  Account: string
  [key: string]: unknown
}

export interface ManagerioInvoice {
  Key: string
  Reference: string
  Date: string
  DueDate: string
  Lines: ManagerioInvoiceLine[]
  Total: number
  TotalTax: number
  AmountDue: number
  Contact: string
  Currency: string
  Status: string
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Draft': return 'DRAFT'
    case 'Unpaid': return 'AUTHORIZED'
    case 'Paid': return 'PAID'
    case 'Voided': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: ManagerioInvoiceLine): Lineitem {
  return {
    itemId: line.Item || undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.LineTotal,
    taxAmount: line.TaxAmount,
    taxrateId: line.Tax || undefined,
    accountId: line.Account || undefined,
  }
}

export function transformInvoice(raw: ManagerioInvoice): Invoice {
  return {
    id: String(raw.Key),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.Reference || String(raw.Key),
    contactId: raw.Contact || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    taxAmount: raw.TotalTax,
    balanceAmount: raw.AmountDue,
    reference: raw.Reference || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    Reference: invoice.invoiceNumber ?? invoice.reference,
    Date: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    Contact: invoice.contactId,
    Currency: invoice.currency,
    Lines: invoice.lineItems?.map((li) => ({
      Item: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      Account: li.accountId,
      Tax: li.taxrateId,
    })),
  }
}
