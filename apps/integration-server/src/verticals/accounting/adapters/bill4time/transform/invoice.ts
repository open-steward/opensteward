import { toCalendarDate } from '../../shared/transform'
/**
 * Bill4Time → canonical Invoice transform.
 *
 * Bill4Time v2 invoice fields (from B4T API documentation):
 *   InvoiceId, InvoiceNumber, ClientID, InvoiceDate, DueDate,
 *   TotalAmount, BalanceDue, AmountPaid, TaxAmount, Notes,
 *   Status (e.g. "Draft", "Sent", "Paid", "Partial", "Void"),
 *   Currency, InvoiceItems[]
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface Bill4TimeInvoiceItem {
  ItemId?: string | number
  Description?: string
  Quantity?: number
  Rate?: number
  Amount?: number
  TaxAmount?: number
  [key: string]: unknown
}

export interface Bill4TimeInvoice {
  InvoiceId?: string | number
  InvoiceNumber?: string
  ClientID?: string | number
  InvoiceDate?: string
  DueDate?: string
  TotalAmount?: number
  BalanceDue?: number
  AmountPaid?: number
  TaxAmount?: number
  Notes?: string
  /** "Draft" | "Sent" | "Paid" | "Partial" | "Void" */
  Status?: string
  Currency?: string
  InvoiceItems?: Bill4TimeInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(raw: Bill4TimeInvoice): InvoiceStatus {
  const s = (raw.Status ?? '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'sent' || s === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(item: Bill4TimeInvoiceItem): Lineitem {
  return {
    id: item.ItemId != null ? String(item.ItemId) : undefined,
    itemDescription: item.Description || undefined,
    unitAmount: item.Rate,
    unitQuantity: item.Quantity != null ? Math.round(item.Quantity) : undefined,
    taxAmount: item.TaxAmount,
    totalAmount: item.Amount,
  }
}

export function transformInvoice(raw: Bill4TimeInvoice): Invoice {
  const id = raw.InvoiceId != null ? String(raw.InvoiceId) : undefined
  const total = raw.TotalAmount ?? 0
  const balance = raw.BalanceDue ?? 0
  const paid = raw.AmountPaid ?? (total - balance)

  return {
    id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.InvoiceNumber || id,
    contactId: raw.ClientID != null ? String(raw.ClientID) : undefined,
    currency: raw.Currency || undefined,
    totalAmount: total,
    taxAmount: raw.TaxAmount,
    balanceAmount: balance,
    paidAmount: paid || undefined,
    notes: raw.Notes || undefined,
    lineItems: (raw.InvoiceItems ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Invoice → Bill4Time request body (for create/update). */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    ClientID: invoice.contactId,
    Currency: invoice.currency,
    InvoiceDate: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    Notes: invoice.notes,
    InvoiceItems: invoice.lineItems?.map((li) => ({
      Description: li.itemDescription,
      Rate: li.unitAmount,
      Quantity: li.unitQuantity,
      Amount: li.totalAmount,
      TaxAmount: li.taxAmount,
    })),
  }
}
