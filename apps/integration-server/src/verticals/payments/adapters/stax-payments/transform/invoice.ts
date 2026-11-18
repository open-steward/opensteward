import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { majorNumber, optStr, requiredId } from './shared'

/**
 * A Stax invoice, as GET /invoice lists it and GET /invoice/{id} returns it.
 * Fields from the documented response examples:
 * https://docs.staxpayments.com/reference/get-all-invoices
 * https://docs.staxpayments.com/reference/get-an-invoice
 */
export interface RawStaxInvoice {
  id?: string
  customer_id?: string | null
  schedule_id?: string | null
  status?: string | null
  total?: number | null
  total_paid?: number | null
  balance_due?: number | null
  meta?: { subtotal?: number | string | null; tax?: number | string | null } | null
  paid_at?: string | null
  due_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * Statuses from https://docs.staxpayments.com/reference/invoices ("Status
 * Transitions Overview"): DRAFT, SENT, VIEWED, PAID, PARTIALLY APPLIED,
 * ATTEMPTED, DELETED. SENT, VIEWED, PARTIALLY APPLIED and ATTEMPTED all leave
 * money owed. DELETED is a soft delete, which is not a void.
 */
function mapStatus(s: unknown): InvoiceStatus {
  switch (s) {
    case 'DRAFT':
      return 'draft'
    case 'SENT':
    case 'VIEWED':
    case 'PARTIALLY APPLIED':
    case 'ATTEMPTED':
      return 'open'
    case 'PAID':
      return 'paid'
    default:
      return 'unknown'
  }
}

/**
 * Stax invoices carry no currency field; `currency` is the merchant's, from
 * GET /self (see `index.ts`).
 */
export function transformInvoice(raw: RawStaxInvoice, currency: string): Invoice {
  const id = requiredId(raw.id, 'invoice')
  const total = majorNumber(raw.total)
  if (total === undefined) throw new Error(`Stax Payments invoice ${id} has no total`)
  const paid = majorNumber(raw.total_paid)
  const due = majorNumber(raw.balance_due)
  const subtotal = majorNumber(raw.meta?.subtotal)
  const tax = majorNumber(raw.meta?.tax)
  return {
    id,
    externalId: id,
    customerId: optStr(raw.customer_id),
    subscriptionId: optStr(raw.schedule_id),
    status: mapStatus(raw.status),
    currency,
    ...(subtotal === undefined ? {} : { subtotal: majorToMinor(subtotal, currency) }),
    ...(tax === undefined ? {} : { tax: majorToMinor(tax, currency) }),
    total: majorToMinor(total, currency),
    ...(due === undefined ? {} : { amountDue: majorToMinor(due, currency) }),
    ...(paid === undefined ? {} : { amountPaid: majorToMinor(paid, currency) }),
    dueDate: toIsoDatetime(raw.due_at),
    paidAt: toIsoDatetime(raw.paid_at),
    gateway: 'stax-payments',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
