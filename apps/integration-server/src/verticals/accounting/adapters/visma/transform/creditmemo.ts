import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface VismaCreditInvoiceRow {
  LineNumber: number
  ArticleId: string
  ArticleNumber: string
  Text: string
  UnitPrice: number
  Quantity: number
  DiscountPercentage: number
  TotalAmount: number
  TotalVatAmount: number
  [key: string]: unknown
}

export interface VismaCreditInvoice {
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
  Rows: VismaCreditInvoiceRow[]
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

function mapStatus(inv: VismaCreditInvoice): CreditMemoStatus {
  if (inv.RemainingAmount === 0 && Math.abs(inv.TotalAmount) > 0) return 'PAID'
  if (
    inv.RemainingAmount !== 0 &&
    Math.abs(inv.RemainingAmount) < Math.abs(inv.TotalAmount)
  )
    return 'PARTIALLY_PAID'
  if (inv.InvoiceNumber > 0) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: VismaCreditInvoiceRow): Lineitem {
  return {
    id: String(row.LineNumber),
    itemId: row.ArticleId || row.ArticleNumber || undefined,
    itemDescription: row.Text || undefined,
    unitAmount: row.UnitPrice,
    unitQuantity: row.Quantity,
    totalAmount: row.TotalAmount,
    taxAmount: row.TotalVatAmount,
    discountAmount:
      row.DiscountPercentage
        ? row.UnitPrice * row.Quantity * row.DiscountPercentage
        : undefined,
  }
}

export function transformCreditMemo(raw: VismaCreditInvoice): CreditMemo {
  return {
    id: raw.Id,
    status: mapStatus(raw),
    creditmemoNumber: raw.InvoiceNumber ? String(raw.InvoiceNumber) : undefined,
    contactId: raw.CustomerId || undefined,
    currency: raw.InvoiceCurrencyCode || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.TotalVatAmount,
    balanceAmount: raw.RemainingAmount,
    lineItems: (raw.Rows ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    CustomerId: cm.contactId,
    IsCreditInvoice: true,
    InvoiceDate: toCalendarDate(cm.postedAt),
    DueDate: toCalendarDate(cm.dueAt),
    Rows: cm.lineItems?.map((li, i) => ({
      LineNumber: i + 1,
      ArticleId: li.itemId,
      Text: li.itemDescription,
      UnitPrice: li.unitAmount,
      Quantity: li.unitQuantity,
    })),
  }
}
