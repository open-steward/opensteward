/**
 * Trolley Invoice → canonical Invoice.
 *
 * List:  POST /v1/invoices/search → { ok, invoices: [...], meta: { page, pages, records } }
 * Get:   POST /v1/invoices/get     → { ok, invoice: { ... } }
 *
 * Amounts are objects of a decimal string and its currency, as in the "Search
 * invoices" example response (https://developers.trolley.com/api/):
 *
 *   "totalAmount": { "value": "400.00", "currency": "EUR" }
 *
 * Statuses are the five documented Invoice Statuses: `open` ("no payment has
 * been initiated") and `pending` ("added to a batch, or a payment is currently
 * processing, but not completed") and `partially_paid` map to canonical
 * `open`; `paid` to `paid`; `void` ("Sent payments were returned.") to
 * `void`.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

export interface RawTrolleyAmount {
  value?: string | null
  currency?: string | null
}

export interface RawTrolleyInvoice {
  id?: string | null
  invoiceNumber?: string | null
  description?: string | null
  status?: string | null
  externalId?: string | null
  invoiceDate?: string | null
  dueDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  totalAmount?: RawTrolleyAmount | null
  paidAmount?: RawTrolleyAmount | null
  dueAmount?: RawTrolleyAmount | null
  recipientId?: string | null
  lines?: Array<{ id?: string | null; [k: string]: unknown }> | null
  [k: string]: unknown
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

function minor(
  a: RawTrolleyAmount | null | undefined,
): { amount: number; currency: string } | undefined {
  const value = text(a?.value)
  const currency = text(a?.currency)
  if (value === undefined || !currency) return undefined
  const amount = majorToMinor(Number(value), currency)
  return amount === undefined ? undefined : { amount, currency: currency.toUpperCase() }
}

function mapStatus(s: string | null | undefined): InvoiceStatus {
  switch (s) {
    case 'open':
    case 'pending':
    case 'partially_paid':
      return 'open'
    case 'paid':
      return 'paid'
    case 'void':
      return 'void'
    default:
      return 'unknown'
  }
}

export function transformInvoice(raw: RawTrolleyInvoice): Invoice {
  const id = text(raw.id)
  if (!id) throw new Error('Trolley invoice has no id')
  const total = minor(raw.totalAmount)
  if (!total) throw new Error(`Trolley invoice ${id} has no totalAmount value/currency`)
  const paid = minor(raw.paidAmount)
  const due = minor(raw.dueAmount)
  const lineIds = (raw.lines ?? []).map((l) => text(l.id)).filter((x): x is string => !!x)
  const metadata: Record<string, string> = {}
  const description = text(raw.description)
  const externalId = text(raw.externalId)
  const invoiceDate = text(raw.invoiceDate)
  if (description) metadata['description'] = description
  if (externalId) metadata['externalId'] = externalId
  if (invoiceDate) metadata['invoiceDate'] = invoiceDate
  if (raw.status) metadata['status'] = raw.status
  return {
    id,
    externalId: id,
    number: text(raw.invoiceNumber),
    customerId: text(raw.recipientId),
    status: mapStatus(raw.status),
    currency: total.currency,
    total: total.amount,
    ...(paid ? { amountPaid: paid.amount } : {}),
    ...(due ? { amountDue: due.amount } : {}),
    dueDate: text(raw.dueDate),
    ...(lineIds.length > 0 ? { lineItemIds: lineIds } : {}),
    gateway: 'trolley',
    metadata,
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
    raw,
  }
}
