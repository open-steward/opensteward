/**
 * Bokio `invoice` → canonical Invoice.
 *
 * Shape: the `invoice` schema of GET /companies/{companyId}/invoices/{invoiceId}
 * (https://docs.bokio.se/reference/get-invoices-invoiceid.md), which is also
 * the row of GET /companies/{companyId}/invoices
 * (https://docs.bokio.se/reference/get-invoice.md). Only fields that schema
 * declares are read; the whole row is kept as `metadata`.
 *
 * Amounts are decimal major units of `currency`. The "Getting Started with the
 * Invoice API" guide (https://docs.bokio.se/docs/how-to-use-invoice-api.md)
 * creates one line of quantity 180 at unitPrice 290 with taxRate 25 and gets
 * back `totalAmount: 65250, totalTax: 13050` SEK: 180 × 290 = 52,200, plus
 * 25 % = 65,250. They are converted to minor units with the currency.
 */
import { toCalendarDate, toMinorUnits } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

/**
 * One entry of `lineItems`: `invoiceItem` is a oneOf of `salesInvoiceItem`
 * (itemType `salesItem`) and `descriptionOnlyInvoiceItem` (itemType
 * `descriptionOnlyItem`), so the sales fields are optional here.
 */
export interface BokioInvoiceItem {
  /** int64, "Should not be set for new items". */
  id?: number | null
  description?: string
  itemType?: 'salesItem' | 'descriptionOnlyItem' | string
  productType?: 'goods' | 'services' | string
  unitType?: string
  quantity?: number
  unitPrice?: number
  /** Percent, e.g. 25. */
  taxRate?: number
  /** int32 account number from the chart of accounts. */
  bookkeepingAccountNumber?: number | null
  [key: string]: unknown
}

/** `customerRef` (id uuid, name, customerNumber). */
export interface BokioCustomerRef {
  id?: string
  name?: string
  customerNumber?: string
}

export interface BokioInvoice {
  id: string
  type?: 'invoice' | 'cashInvoice' | string
  customerRef?: BokioCustomerRef
  invoiceNumber?: string | null
  currency?: string
  currencyRate?: number
  totalAmount?: number
  totalTax?: number
  paidAmount?: number
  status?: string
  invoiceDate?: string
  dueDate?: string
  publishedDateTime?: string | null
  lineItems?: BokioInvoiceItem[]
  [key: string]: unknown
}

/**
 * The documented `status` enum: draft, published, paid, overPaid, underPaid,
 * overdue, credited, credit. The docs define none of them further.
 *
 * `credited` → VOIDED: the invoice was cancelled by a credit note, which is
 * how every adapter with a native credited status maps it (billit, netvisor,
 * procountor, rillet's CREDITED, myob's CreditApplied). The credit note
 * itself points back at the invoice via `invoiceRef.id`
 * (https://docs.bokio.se/reference/get-credit-note-v1.md).
 *
 * `credit` stays `unknown`: it most plausibly marks the document itself as a
 * credit invoice rather than an invoice that was credited, and the docs do
 * not say which, so voiding it would be a guess.
 */
function mapStatus(status: string | undefined): InvoiceStatus | undefined {
  switch (status) {
    case undefined:
      return undefined
    case 'draft':
      return 'DRAFT'
    case 'published':
      return 'AUTHORIZED'
    case 'paid':
    case 'overPaid':
      return 'PAID'
    case 'underPaid':
      return 'PARTIALLY_PAID'
    case 'overdue':
      return 'OVERDUE'
    case 'credited':
      return 'VOIDED'
    default:
      return 'unknown'
  }
}

/** `quantity` is a double (hours, kilograms); the canonical one is an integer. */
function integerOrUndefined(n: number | undefined): number | undefined {
  return typeof n === 'number' && Number.isInteger(n) ? n : undefined
}

/**
 * Shared with credit notes, whose `lineItems` are the same `invoiceItem`
 * oneOf (https://docs.bokio.se/reference/get-credit-note-v1.md).
 *
 * `bookkeepingAccountNumber` is the chart-of-accounts `account` number, the
 * same id space as `Account.id` (see transform/account.ts). No per-line total
 * or tax amount is documented, so none is derived.
 */
export function mapInvoiceItem(item: BokioInvoiceItem, currency?: string): Lineitem {
  const account =
    item.bookkeepingAccountNumber === undefined || item.bookkeepingAccountNumber === null
      ? undefined
      : String(item.bookkeepingAccountNumber)
  return {
    id: item.id === undefined || item.id === null ? undefined : String(item.id),
    accountId: account,
    accountCode: account,
    itemDescription: item.description || undefined,
    unitAmount: toMinorUnits(item.unitPrice, currency),
    unitQuantity: integerOrUndefined(item.quantity),
  }
}

export function transformInvoice(raw: BokioInvoice): Invoice {
  const currency = raw.currency || undefined
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.invoiceNumber || undefined,
    contactId: raw.customerRef?.id || undefined,
    currency,
    totalAmount: toMinorUnits(raw.totalAmount, currency),
    taxAmount: toMinorUnits(raw.totalTax, currency),
    paidAmount: toMinorUnits(raw.paidAmount, currency),
    lineItems: raw.lineItems ? raw.lineItems.map((li) => mapInvoiceItem(li, currency)) : undefined,
    postedAt: toCalendarDate(raw.invoiceDate),
    dueAt: toCalendarDate(raw.dueDate),
    metadata: raw as Record<string, unknown>,
  }
}
