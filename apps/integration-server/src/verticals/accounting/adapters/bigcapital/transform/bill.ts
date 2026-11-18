import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

/**
 * Convert a Bigcapital float major-unit amount to integer minor units (cents).
 * Returns undefined when the value is not a finite number.
 */
function toMinor(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.round(value * 100)
}

export interface BigcapitalBillEntry {
  index: number
  itemId?: number
  rate?: number
  quantity?: number
  discount?: number
  description?: string
  taxRateId?: number
  costAccountId?: number
  [key: string]: unknown
}

export interface BigcapitalBill {
  id: number
  billNumber?: string
  billDate: string
  dueDate?: string
  vendorId: number
  currencyCode?: string
  note?: string
  referenceNo?: string
  entries: BigcapitalBillEntry[]
  // computed status flags
  isFullyPaid: boolean
  isPartiallyPaid: boolean
  isOverdue: boolean
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

function mapStatus(bill: BigcapitalBill): BillStatus {
  if (bill.isFullyPaid) return 'PAID'
  if (bill.isPartiallyPaid) return 'PARTIALLY_PAID'
  if (bill.isOverdue) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapEntry(entry: BigcapitalBillEntry): Lineitem {
  return {
    id: String(entry.index),
    itemId: entry.itemId != null ? String(entry.itemId) : undefined,
    itemDescription: entry.description || undefined,
    unitAmount: toMinor(entry.rate),
    unitQuantity: entry.quantity ?? undefined,
    discountAmount: toMinor(entry.discount),
  }
}

export function transformBill(raw: BigcapitalBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.billNumber || undefined,
    contactId: raw.vendorId != null ? String(raw.vendorId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: toMinor(raw.total),
    balanceAmount: toMinor(raw.balance),
    paidAmount: toMinor(raw.paymentAmount),
    taxAmount: toMinor(raw.taxAmountWithheld),
    notes: raw.note || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Bill → Bigcapital request body (for create/update)
// Canonical amounts are integer minor units; Bigcapital expects major-unit floats.
export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    vendorId: bill.contactId != null ? Number(bill.contactId) : undefined,
    currencyCode: bill.currency,
    billDate: toCalendarDate(bill.postedAt),
    dueDate: toCalendarDate(bill.dueAt),
    note: bill.notes,
    entries: bill.lineItems?.map((li, idx) => ({
      index: idx + 1,
      itemId: li.itemId != null ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      rate: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      quantity: li.unitQuantity,
      discount: li.discountAmount != null ? li.discountAmount / 100 : undefined,
    })),
  }
}
