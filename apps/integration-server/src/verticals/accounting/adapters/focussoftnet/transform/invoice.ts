import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FocusSoftnetInvoiceLine {
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  SubTotal: number
  TaxAmt: number
  AccCode: string
  [key: string]: unknown
}

export interface FocusSoftnetInvoice {
  DocNo: string
  DocDate: string
  DueDate: string
  SubTotal: number
  TaxAmt: number
  TotalAmt: number
  OutstandingAmt: number
  DocStatus: string
  CustCode: string
  CurrCode: string
  Lines: FocusSoftnetInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'D': return 'DRAFT'
    case 'A': return 'AUTHORIZED'
    case 'P': return 'PAID'
    case 'C': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(line: FocusSoftnetInvoiceLine): Lineitem {
  return {
    itemId: line.ItemCode || undefined,
    itemDescription: line.Description || undefined,
    unitQuantity: line.Qty,
    unitAmount: line.UnitPrice,
    totalAmount: line.SubTotal,
    taxAmount: line.TaxAmt,
    accountId: line.AccCode || undefined,
  }
}

export function transformInvoice(raw: FocusSoftnetInvoice): Invoice {
  return {
    id: String(raw.DocNo),
    type: 'INVOICE',
    status: mapStatus(raw.DocStatus),
    invoiceNumber: String(raw.DocNo),
    contactId: raw.CustCode || undefined,
    currency: raw.CurrCode || undefined,
    totalAmount: raw.TotalAmt,
    taxAmount: raw.TaxAmt,
    balanceAmount: raw.OutstandingAmt,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    CustCode: invoice.contactId,
    CurrCode: invoice.currency,
    DocDate: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    Lines: invoice.lineItems?.map((li) => ({
      ItemCode: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      AccCode: li.accountId,
    })),
  }
}
