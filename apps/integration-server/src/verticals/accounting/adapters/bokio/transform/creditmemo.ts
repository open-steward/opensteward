/**
 * Bokio `creditNote` → canonical CreditMemo.
 *
 * Shape: the `creditNote` schema of GET
 * /companies/{companyId}/credit-notes/{creditNoteId}
 * (https://docs.bokio.se/reference/get-credit-note-v1.md), also the row of GET
 * /companies/{companyId}/credit-notes
 * (https://docs.bokio.se/reference/list-credit-notes-v1.md). Amounts are
 * decimal major units of `currency`, as on invoices (see transform/invoice.ts).
 */
import { toCalendarDate, toMinorUnits } from '../../shared/transform'
import type {
  CreditMemo,
  CreditMemoApplication,
  CreditMemoStatus,
} from '../../../schema/creditmemo'
import { mapInvoiceItem, type BokioCustomerRef, type BokioInvoiceItem } from './invoice'

export interface BokioCreditNote {
  id: string
  /** Reference to the original invoice being credited. */
  invoiceRef?: { id?: string; invoiceNumber?: string }
  customerRef?: BokioCustomerRef
  /** "The credit note number". */
  invoiceNumber?: string | null
  currency?: string
  totalAmount?: number
  totalTax?: number
  paidAmount?: number
  status?: string
  creditDate?: string
  dueDate?: string
  publishedDateTime?: string | null
  lineItems?: BokioInvoiceItem[]
  [key: string]: unknown
}

/** The documented `status` enum is exactly draft and published. */
function mapStatus(status: string | undefined): CreditMemoStatus | undefined {
  switch (status) {
    case undefined:
      return undefined
    case 'draft':
      return 'DRAFT'
    case 'published':
      return 'AUTHORIZED'
    default:
      return 'unknown'
  }
}

/**
 * `invoiceRef` is the documented "Reference to the original invoice being
 * credited": `id` is the original invoice's id, `invoiceNumber` its number.
 * Bokio records no per-application amount or date.
 */
function mapAppliedTo(ref: BokioCreditNote['invoiceRef']): CreditMemoApplication[] | undefined {
  const invoiceId = ref?.id || undefined
  const invoiceNumber = ref?.invoiceNumber || undefined
  if (invoiceId === undefined && invoiceNumber === undefined) return undefined
  return [{ invoiceId, invoiceNumber }]
}

export function transformCreditMemo(raw: BokioCreditNote): CreditMemo {
  const currency = raw.currency || undefined
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerRef?.id || undefined,
    currency,
    totalAmount: toMinorUnits(raw.totalAmount, currency),
    taxAmount: toMinorUnits(raw.totalTax, currency),
    paidAmount: toMinorUnits(raw.paidAmount, currency),
    lineItems: raw.lineItems ? raw.lineItems.map((li) => mapInvoiceItem(li, currency)) : undefined,
    appliedTo: mapAppliedTo(raw.invoiceRef),
    postedAt: toCalendarDate(raw.creditDate),
    dueAt: toCalendarDate(raw.dueDate),
    metadata: raw as Record<string, unknown>,
  }
}
