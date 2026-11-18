import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import {
  optionalMinor,
  pickStr,
  requireCurrency,
  requireMinor,
  strMap,
  toIsoDatetime,
} from './shared'

/**
 * Rapyd Invoice object, as the List Invoices / Retrieve Invoice responses
 * document it (https://docs.rapyd.net/en/list-invoices.html,
 * https://docs.rapyd.net/en/retrieve-invoice.html). Only the documented
 * fields this transform reads are typed.
 *
 *   id        "ID of the invoice. String starting with invoice_."
 *   currency  "Three-letter ISO 4217 currency code for the currency used in all
 *             fields that refer to a monetary amount."
 *   subtotal  "Total of all line items before discount and before tax. Decimal."
 *   tax       "The amount of tax charged. Decimal."
 *   total     "Total after discount and tax. Decimal."
 *   status    draft | deleted | open | paid | void | uncollectible
 *
 * The documented example gives `created_at` in milliseconds and the period
 * fields in seconds; `toIsoDatetime` reads both.
 */
export interface RawRapydInvoice {
  id?: string
  customer?: string
  subscription?: string
  number?: string
  status?: string
  currency?: string
  subtotal?: number | string
  tax?: number | string
  total?: number | string
  due_date?: number | string
  period_start?: number | string
  period_end?: number | string
  created_at?: number | string
  lines?: { id?: string }[] | null
  metadata?: Record<string, unknown> | null
  [k: string]: unknown
}

function mapStatus(status: unknown): InvoiceStatus {
  switch (status) {
    case 'draft':
      return 'draft'
    case 'open':
      return 'open'
    case 'paid':
      return 'paid'
    case 'void':
      return 'void'
    case 'uncollectible':
      return 'uncollectible'
    default:
      // `deleted` ("An invoice can be deleted only when its status is draft")
      // has no canonical counterpart.
      return 'unknown'
  }
}

export function transformInvoice(raw: RawRapydInvoice): Invoice {
  const id = pickStr(raw.id)
  if (!id) throw new Error('Rapyd invoice has no id')
  const currency = requireCurrency(raw.currency, `invoice ${id}`)
  const lineItemIds = Array.isArray(raw.lines)
    ? raw.lines.map((l) => pickStr(l?.id)).filter((x): x is string => x !== undefined)
    : undefined
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    customerId: pickStr(raw.customer),
    subscriptionId: pickStr(raw.subscription),
    status: mapStatus(raw.status),
    currency,
    subtotal: optionalMinor(raw.subtotal, currency),
    tax: optionalMinor(raw.tax, currency),
    total: requireMinor(raw.total, currency, `invoice ${id}`),
    dueDate: toIsoDatetime(raw.due_date),
    periodStart: toIsoDatetime(raw.period_start),
    periodEnd: toIsoDatetime(raw.period_end),
    lineItemIds: lineItemIds && lineItemIds.length > 0 ? lineItemIds : undefined,
    gateway: 'rapyd',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
