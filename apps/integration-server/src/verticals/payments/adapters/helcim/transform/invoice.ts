/**
 * Helcim invoice ↔ canonical Invoice.
 *
 * Helcim's Invoice API (`GET /invoices`, `GET /invoices/{id}`,
 * `POST /invoices`, `PATCH /invoices/{id}`) surfaces invoice objects with
 * a numeric `id`, human-readable `invoiceNumber`, and a `status` from:
 * PAID, CANCELLED, DUE, SHIPPED, COMPLETED, REFUNDED, APPROVED, OVERDUE,
 * FOR_APPROVAL, APP_IN_PROGRESS.
 *
 * Amounts arrive as decimal dollars; we convert to integer minor units.
 * Dates are `YYYY-MM-DD HH:MM:SS` Mountain Time (same convention as
 * card-transactions); `toIsoDatetime` normalises the space separator.
 *
 * Refs:
 *   https://devdocs.helcim.com/reference/getinvoices
 *   https://devdocs.helcim.com/reference/getinvoice
 *   https://devdocs.helcim.com/docs/invoices
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawHelcimInvoice {
  id?: number | string
  invoiceNumber?: string
  token?: string
  status?: string
  type?: string
  customerId?: number | string
  currency?: string
  /** Total amount due (decimal dollars). */
  amount?: number | string
  tipAmount?: number | string
  depositAmount?: number | string
  convenienceFee?: number | string
  notes?: string
  dateCreated?: string
  dateUpdated?: string
  datePaid?: string
  dateIssued?: string
  lineItems?: unknown[]
  billingAddress?: unknown
  shipping?: unknown
  tax?: { amount?: number | string; [k: string]: unknown }
  discounts?: { amount?: number | string; [k: string]: unknown }
  [k: string]: unknown
}

function mapStatus(raw: RawHelcimInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
      return 'paid'
    case 'CANCELLED':
    case 'REFUNDED':
      return 'void'
    case 'DUE':
    case 'OVERDUE':
    case 'SHIPPED':
    case 'FOR_APPROVAL':
    case 'APP_IN_PROGRESS':
      return 'open'
    case 'APPROVED':
    case 'COMPLETED':
      return 'paid'
    default:
      return 'draft'
  }
}

export function transformInvoice(raw: RawHelcimInvoice): Invoice {
  const total = toMinorUnits(raw.amount)
  const taxAmount = raw.tax && typeof raw.tax === 'object' ? toMinorUnits(raw.tax.amount) : 0
  const discountAmount =
    raw.discounts && typeof raw.discounts === 'object'
      ? toMinorUnits((raw.discounts as { amount?: number | string }).amount)
      : 0
  const subtotal = total - taxAmount + discountAmount
  const status = mapStatus(raw)
  const lineItemIds = Array.isArray(raw.lineItems)
    ? (raw.lineItems as Array<{ id?: number | string }>)
        .map((li) => String(li?.id ?? ''))
        .filter(Boolean)
    : undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.invoiceNumber || undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    status,
    currency: pickCurrency(raw.currency),
    subtotal: subtotal > 0 ? subtotal : undefined,
    tax: taxAmount > 0 ? taxAmount : undefined,
    total,
    amountDue: status === 'paid' ? 0 : total,
    amountPaid: status === 'paid' ? total : undefined,
    amountRemaining: status === 'paid' ? 0 : total,
    paidAt: raw.datePaid ? toIsoDatetime(raw.datePaid) : undefined,
    lineItemIds: lineItemIds && lineItemIds.length > 0 ? lineItemIds : undefined,
    gateway: 'helcim',
    metadata: strMap({
      type: raw.type,
      token: raw.token,
      notes: raw.notes,
      tipAmount: raw.tipAmount,
      depositAmount: raw.depositAmount,
    }),
    createdAt: raw.dateCreated ? toIsoDatetime(raw.dateCreated) : undefined,
    updatedAt: raw.dateUpdated ? toIsoDatetime(raw.dateUpdated) : undefined,
    raw,
  }
}
