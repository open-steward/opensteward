import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FacturamaInvoiceItem {
  Id: string
  ProductCode: string
  Description: string
  UnitPrice: number
  Quantity: number
  Total: number
  TaxAmount: number
  AccountCode: string
  Discount: number
  Unit: string
  [key: string]: unknown
}

export interface FacturamaInvoice {
  Id: string
  Folio: string
  ClientId: string
  ClientName: string
  Date: string
  DueDate: string
  Total: number
  TaxAmount: number
  Balance: number
  Currency: string
  Status: string
  IsCancelled: boolean
  PaidAmount: number
  Reference: string
  Items: FacturamaInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(inv: FacturamaInvoice): InvoiceStatus {
  if (inv.IsCancelled) return 'VOIDED'
  if (inv.Status === 'paid' || inv.Balance === 0) return 'PAID'
  if (inv.Balance > 0 && inv.Balance < inv.Total) return 'PARTIALLY_PAID'
  if (inv.Status === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: FacturamaInvoiceItem): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.AccountCode || undefined,
    itemId: row.ProductCode || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.Total,
    taxAmount: row.TaxAmount,
    discountAmount: row.Discount || undefined,
  }
}

export function transformInvoice(raw: FacturamaInvoice): Invoice {
  return {
    id: String(raw.Id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.Folio || undefined,
    contactId: raw.ClientId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    taxAmount: raw.TaxAmount,
    balanceAmount: raw.Balance,
    paidAmount: raw.PaidAmount || undefined,
    reference: raw.Reference || undefined,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    ClientId: invoice.contactId,
    Currency: invoice.currency,
    Date: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    Reference: invoice.reference,
    Items: invoice.lineItems?.map((li) => ({
      ProductCode: li.itemId,
      Description: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
      AccountCode: li.accountId,
    })),
  }
}
