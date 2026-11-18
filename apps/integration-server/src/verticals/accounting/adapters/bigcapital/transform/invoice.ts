import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

/**
 * Convert a Bigcapital float major-unit amount to integer minor units (cents).
 * Returns undefined when the value is not a finite number.
 */
function toMinor(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.round(value * 100)
}

export interface BigcapitalInvoiceEntry {
  index: number
  itemId?: number
  rate?: number
  quantity?: number
  discount?: number
  discountType?: string
  description?: string
  taxRateId?: number
  sellAccountId?: number
  [key: string]: unknown
}

export interface BigcapitalInvoice {
  id: number
  invoiceNo: string
  invoiceDate: string
  dueDate?: string
  customerId: number
  currencyCode?: string
  invoiceMessage?: string
  referenceNo?: string
  entries: BigcapitalInvoiceEntry[]
  // computed status flags
  isFullyPaid: boolean
  isPartiallyPaid: boolean
  isOverdue: boolean
  delivered: boolean
  // financials
  total?: number
  subtotal?: number
  balance?: number
  dueAmount?: number
  paymentAmount?: number
  taxAmountWithheld?: number
  creditedAmount?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(inv: BigcapitalInvoice): InvoiceStatus {
  if (inv.isFullyPaid) return 'PAID'
  if (inv.isPartiallyPaid) return 'PARTIALLY_PAID'
  if (inv.isOverdue) return 'OVERDUE'
  if (inv.delivered) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapEntry(entry: BigcapitalInvoiceEntry): Lineitem {
  return {
    id: String(entry.index),
    itemId: entry.itemId != null ? String(entry.itemId) : undefined,
    itemDescription: entry.description || undefined,
    unitAmount: toMinor(entry.rate),
    unitQuantity: entry.quantity ?? undefined,
    discountAmount: toMinor(entry.discount),
  }
}

export function transformInvoice(raw: BigcapitalInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoiceNo || undefined,
    contactId: raw.customerId != null ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: toMinor(raw.total),
    balanceAmount: toMinor(raw.balance),
    paidAmount: toMinor(raw.paymentAmount),
    taxAmount: toMinor(raw.taxAmountWithheld),
    reference: raw.referenceNo || undefined,
    notes: raw.invoiceMessage || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Invoice → Bigcapital request body (for create/update)
// Canonical amounts are integer minor units; Bigcapital expects major-unit floats.
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customerId: invoice.contactId != null ? Number(invoice.contactId) : undefined,
    currencyCode: invoice.currency,
    invoiceDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    referenceNo: invoice.reference,
    invoiceMessage: invoice.notes,
    entries: invoice.lineItems?.map((li, idx) => ({
      index: idx + 1,
      itemId: li.itemId != null ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      rate: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      quantity: li.unitQuantity,
      discount: li.discountAmount != null ? li.discountAmount / 100 : undefined,
    })),
  }
}
