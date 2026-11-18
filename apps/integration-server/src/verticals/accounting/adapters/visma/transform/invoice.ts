import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface VismaInvoiceRow {
  LineNumber: number
  ArticleId: string
  ArticleNumber: string
  Text: string
  UnitPrice: number
  Quantity: number
  DiscountPercentage: number
  TotalAmount: number
  TotalVatAmount: number
  CostCenterItemId1: string
  ProjectId: string
  [key: string]: unknown
}

export interface VismaCustomerInvoice {
  Id: string
  CustomerId: string
  CustomerNumber: string
  InvoiceDate: string
  DueDate: string
  TotalAmount: number
  TotalVatAmount: number
  RemainingAmount: number
  InvoiceCurrencyCode: string
  IsCreditInvoice: boolean
  InvoiceNumber: number
  YourReference: string
  OurReference: string
  Rows: VismaInvoiceRow[]
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

function mapStatus(inv: VismaCustomerInvoice): InvoiceStatus {
  if (inv.IsCreditInvoice) return 'VOIDED'
  if (inv.RemainingAmount === 0 && inv.TotalAmount > 0) return 'PAID'
  if (inv.RemainingAmount > 0 && inv.RemainingAmount < inv.TotalAmount) return 'PARTIALLY_PAID'
  if (inv.InvoiceNumber > 0 && inv.RemainingAmount > 0) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: VismaInvoiceRow): Lineitem {
  return {
    id: String(row.LineNumber),
    itemId: row.ArticleId || row.ArticleNumber || undefined,
    itemDescription: row.Text || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.TotalAmount,
    taxAmount: row.TotalVatAmount,
    discountAmount: row.DiscountPercentage ? row.UnitPrice * row.Quantity * row.DiscountPercentage : undefined,
  }
}

export function transformInvoice(raw: VismaCustomerInvoice): Invoice {
  return {
    id: raw.Id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNumber ? String(raw.InvoiceNumber) : undefined,
    contactId: raw.CustomerId || undefined,
    currency: raw.InvoiceCurrencyCode || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TotalVatAmount,
    balanceAmount: raw.RemainingAmount,
    reference: raw.YourReference || undefined,
    lineItems: (raw.Rows ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    CustomerId: invoice.contactId,
    InvoiceDate: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    YourReference: invoice.reference,
    Rows: invoice.lineItems?.map((li, i) => ({
      LineNumber: i + 1,
      ArticleId: li.itemId,
      Text: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
    })),
  }
}
