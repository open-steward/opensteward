import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AcumaticaInvoiceLine {
  LineNbr: number
  InventoryID: string
  Description: string
  Qty: number
  UnitPrice: number
  ExtPrice: number
  TaxAmt: number
  AccountID: string
  [key: string]: unknown
}

export interface AcumaticaInvoice {
  RefNbr: string
  Type: string
  Status: string
  Amount: number
  TaxTotal: number
  Balance: number
  CurrencyID: string
  CustomerID: string
  DocDate: string
  DueDate: string
  InvoiceNbr: string
  Details: AcumaticaInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Open':
      return 'AUTHORIZED'
    case 'Closed':
      return 'PAID'
    case 'Hold':
      return 'DRAFT'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: AcumaticaInvoiceLine): Lineitem {
  return {
    id: String(line.LineNbr),
    accountId: line.AccountID || undefined,
    itemId: line.InventoryID || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Qty,
    totalAmount: line.ExtPrice,
    taxAmount: line.TaxAmt || undefined,
  }
}

export function transformInvoice(raw: AcumaticaInvoice): Invoice {
  return {
    id: raw.RefNbr,
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.InvoiceNbr || raw.RefNbr || undefined,
    contactId: raw.CustomerID || undefined,
    currency: raw.CurrencyID || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.TaxTotal || undefined,
    balanceAmount: raw.Balance || undefined,
    lineItems: (raw.Details ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(data: Partial<Invoice>): Record<string, unknown> {
  return {
    CustomerID: data.contactId,
    CurrencyID: data.currency,
    DocDate: toCalendarDate(data.postedAt),
    DueDate: toCalendarDate(data.dueAt),
    Details: data.lineItems?.map((li) => ({
      InventoryID: li.itemId,
      Description: li.itemDescription,
      Qty: li.unitQuantity,
      UnitPrice: li.unitAmount,
      AccountID: li.accountId,
    })),
  }
}
