import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, fromMinorUnits, prefixedId, unprefixedId, toCalendarDate } from '../../shared/transform'

export interface FortnoxInvoiceRow {
  RowId: number
  ArticleNumber: string
  Description: string
  Price: number
  OrderedQuantity: number
  Total: number
  VAT: number
  AccountNumber: string
  Discount: number
  Unit: string
}

export interface FortnoxInvoice {
  DocumentNumber: string
  CustomerNumber: string
  CustomerName: string
  InvoiceDate: string
  DueDate: string
  FinalPayDate: string
  Total: number
  TotalVAT: number
  Balance: number
  Currency: string
  Booked: boolean
  Cancelled: boolean
  Sent: boolean
  InvoiceRows: FortnoxInvoiceRow[]
  ExternalInvoiceReference1: string
  ExternalInvoiceReference2: string
  YourReference: string
  OurReference: string
  OCR: string
  Project: string
  CostCenter: string
  TermsOfPayment: string
  WayOfDelivery: string
  PaymentWay: string
  PaidAmount: number
  [key: string]: unknown
}

function mapStatus(inv: FortnoxInvoice): InvoiceStatus {
  if (inv.Cancelled) return 'VOIDED'
  if (inv.Booked && inv.Balance === 0) return 'PAID'
  if (inv.Booked && inv.Balance > 0 && inv.Balance < inv.Total) return 'PARTIALLY_PAID'
  if (inv.Booked) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: FortnoxInvoiceRow): Lineitem {
  return {
    id: String(row.RowId),
    accountId: row.AccountNumber || undefined,
    itemId: row.ArticleNumber || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: toMinorUnits(row.Price),
    unitQuantity: row.OrderedQuantity,
    totalAmount: toMinorUnits(row.Total),
    taxAmount: toMinorUnits(row.VAT),
    discountAmount: toMinorUnits(row.Discount) || undefined,
  }
}

export function transformInvoice(raw: FortnoxInvoice): Invoice {
  return {
    id: raw.DocumentNumber,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.DocumentNumber,
    contactId: prefixedId('cust', raw.CustomerNumber),
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.Total),
    taxAmount: toMinorUnits(raw.TotalVAT),
    balanceAmount: toMinorUnits(raw.Balance),
    paidAmount: toMinorUnits(raw.PaidAmount) || undefined,
    reference: raw.ExternalInvoiceReference1 || undefined,
    lineItems: raw.InvoiceRows ? raw.InvoiceRows.map(mapLineitem) : null,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Invoice → Fortnox Invoice body (for create/update)
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    CustomerNumber: unprefixedId('cust', invoice.contactId),
    Currency: invoice.currency,
    InvoiceDate: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    ExternalInvoiceReference1: invoice.reference,
    InvoiceRows: invoice.lineItems?.map((li) => ({
      ArticleNumber: li.itemId,
      Description: li.itemDescription,
      Price: fromMinorUnits(li.unitAmount),
      OrderedQuantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
