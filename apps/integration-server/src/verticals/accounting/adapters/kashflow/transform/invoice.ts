import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits, toIsoDateTime } from '../../shared/transform'

/** Safely parse a KashFlow date string into a Date. Never throws. */
function toDate(val: unknown): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

// KashFlow REST API v2 — Invoice

export interface KashflowInvoiceLineItem {
  Number?: number
  Description?: string
  Quantity?: number
  Rate?: number
  VATLevel?: number
  VATAmount?: number
  NominalCode?: number
  ProductCode?: string
  ProductName?: string
  ProjectNumber?: number
  [key: string]: unknown
}

export interface KashflowInvoiceCurrency {
  Code?: string
  [key: string]: unknown
}

export interface KashflowInvoice {
  // Primary identifier
  Number?: number
  Id?: number
  // Customer
  CustomerCode?: string
  CustomerId?: number
  CustomerName?: string
  CustomerReference?: string
  // Dates
  IssuedDate?: string
  DueDate?: string
  PaidDate?: string
  LastPaymentDate?: string
  // Amounts
  GrossAmount?: number
  NetAmount?: number
  VATAmount?: number
  TotalPaidAmount?: number
  CustomerDiscount?: number
  // Status: "Unpaid" | "Paid" | "Overpaid" | "Overdue" | "NA"
  Status?: string
  OverdueDays?: number
  // Currency
  Currency?: KashflowInvoiceCurrency
  // Lines + payments
  LineItems?: KashflowInvoiceLineItem[]
  // Misc
  Permalink?: string
  SuppressNumber?: boolean
  [key: string]: unknown
}

// Pagination envelope returned by GET /invoices
export interface KashflowInvoiceList {
  Invoices?: KashflowInvoice[]
  TotalRecords?: number
  [key: string]: unknown
}

function mapStatus(raw: KashflowInvoice): InvoiceStatus {
  const s = (raw.Status ?? '').toLowerCase()
  if (s === 'paid') return 'PAID'
  if (s === 'overpaid') return 'PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'unpaid') {
    // Partially paid when some but not all has been collected
    if (
      typeof raw.TotalPaidAmount === 'number' &&
      raw.TotalPaidAmount > 0 &&
      typeof raw.GrossAmount === 'number' &&
      raw.TotalPaidAmount < raw.GrossAmount
    ) {
      return 'PARTIALLY_PAID'
    }
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function mapLineItem(li: KashflowInvoiceLineItem): Lineitem {
  // KashFlow returns amounts as decimal pounds (e.g. 100.00); convert to minor units (pence).
  const unitAmount = toMinorUnits(li.Rate)
  const taxAmount = toMinorUnits(li.VATAmount)
  const totalAmount =
    li.Rate !== undefined && li.Quantity !== undefined
      ? toMinorUnits(li.Rate * li.Quantity + (li.VATAmount ?? 0))
      : undefined
  return {
    id: li.Number !== undefined ? String(li.Number) : undefined,
    accountId: li.NominalCode !== undefined ? String(li.NominalCode) : undefined,
    itemId: li.ProductCode || undefined,
    itemName: li.ProductName || undefined,
    itemDescription: li.Description || undefined,
    unitAmount,
    unitQuantity: li.Quantity,
    taxAmount,
    totalAmount,
  }
}

export function transformInvoice(raw: KashflowInvoice): Invoice {
  // KashFlow returns amounts as decimal pounds (e.g. 1100.00); convert to minor units (pence).
  const totalAmount = toMinorUnits(raw.GrossAmount)
  const taxAmount = toMinorUnits(raw.VATAmount)
  const paidAmount = toMinorUnits(raw.TotalPaidAmount)
  const balanceAmount =
    totalAmount !== undefined && paidAmount !== undefined
      ? totalAmount - paidAmount
      : undefined

  return {
    id: raw.Number !== undefined ? String(raw.Number) : raw.Id !== undefined ? String(raw.Id) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.Number !== undefined ? String(raw.Number) : undefined,
    contactId: raw.CustomerCode || undefined,
    currency: raw.Currency?.Code || undefined,
    totalAmount,
    taxAmount,
    paidAmount,
    balanceAmount,
    reference: raw.CustomerReference || undefined,
    url: raw.Permalink || undefined,
    lineItems: (raw.LineItems ?? []).map(mapLineItem),
    postedAt: toDate(raw.IssuedDate),
    dueAt: toDate(raw.DueDate),
    paidAt: toDate(raw.PaidDate),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical minor units (pence) → KashFlow decimal pounds. */
function toDecimalAmount(minor?: number | null): number | undefined {
  return minor === undefined || minor === null ? undefined : minor / 100
}

/** Canonical Invoice → KashFlow request body */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    CustomerCode: invoice.contactId,
    IssuedDate: toIsoDateTime(invoice.postedAt),
    DueDate: toIsoDateTime(invoice.dueAt),
    CustomerReference: invoice.reference,
    LineItems: invoice.lineItems?.map((li) => ({
      Description: li.itemDescription,
      Quantity: li.unitQuantity,
      // KashFlow expects decimal pounds; canonical unitAmount is minor units.
      Rate: toDecimalAmount(li.unitAmount),
      ProductCode: li.itemId,
      NominalCode: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
