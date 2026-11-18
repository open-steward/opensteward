import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

/**
 * Convert a Bigcapital float major-unit amount to integer minor units (cents).
 * Returns undefined when the value is not a finite number.
 */
function toMinor(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined
  return Math.round(value * 100)
}

export interface BigcapitalCreditNoteEntry {
  index: number
  itemId?: number
  rate?: number
  quantity?: number
  discount?: number
  description?: string
  taxRateId?: number
  sellAccountId?: number
  [key: string]: unknown
}

export interface BigcapitalCreditNote {
  id: number
  creditNoteNumber?: string
  creditNoteDate: string
  customerId: number
  currencyCode?: string
  creditNoteMessage?: string
  referenceNo?: string
  entries: BigcapitalCreditNoteEntry[]
  // financials
  total?: number
  subtotal?: number
  balance?: number
  invoicedAmount?: number
  creditsRemaining?: number
  status?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(raw: BigcapitalCreditNote): CreditMemoStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'OPEN' || s === 'APPLIED' || s === 'PARTIAL') return 'AUTHORIZED'
  if (s === 'CLOSED' || s === 'PAID') return 'PAID'
  if (s === 'VOIDED' || s === 'VOID') return 'VOIDED'
  if (raw.balance != null && raw.total != null && raw.balance >= raw.total) return 'AUTHORIZED'
  if (raw.balance != null && raw.balance === 0) return 'PAID'
  return 'DRAFT'
}

function mapEntry(entry: BigcapitalCreditNoteEntry): Lineitem {
  return {
    id: String(entry.index),
    itemId: entry.itemId != null ? String(entry.itemId) : undefined,
    itemDescription: entry.description || undefined,
    unitAmount: toMinor(entry.rate),
    unitQuantity: entry.quantity ?? undefined,
    discountAmount: toMinor(entry.discount),
  }
}

export function transformCreditMemo(raw: BigcapitalCreditNote): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.creditNoteNumber || undefined,
    contactId: raw.customerId != null ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: toMinor(raw.total),
    balanceAmount: toMinor(raw.balance),
    notes: raw.creditNoteMessage || undefined,
    lineItems: (raw.entries ?? []).map(mapEntry),
    postedAt: raw.creditNoteDate ? new Date(raw.creditNoteDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(memo: Partial<CreditMemo>): Record<string, unknown> {
  return {
    customerId: memo.contactId != null ? Number(memo.contactId) : undefined,
    currencyCode: memo.currency,
    creditNoteDate: toCalendarDate(memo.postedAt),
    creditNoteMessage: memo.notes,
    referenceNo: (memo.metadata?.['referenceNo'] as string | undefined),
    entries: memo.lineItems?.map((li, idx) => ({
      index: idx + 1,
      itemId: li.itemId != null ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      rate: li.unitAmount != null ? li.unitAmount / 100 : undefined,
      quantity: li.unitQuantity,
      discount: li.discountAmount != null ? li.discountAmount / 100 : undefined,
    })),
  }
}
