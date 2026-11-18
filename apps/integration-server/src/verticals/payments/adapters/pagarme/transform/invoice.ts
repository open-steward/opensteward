/**
 * Pagar.me v5 invoice transform.
 *
 * Endpoint: GET /invoices, GET /invoices/{id}
 * Invoices in Pagar.me v5 are linked to subscriptions and represent a billing
 * cycle charge. They are a first-class listable resource.
 *
 * Money is in centavos (minor units). Timestamps are ISO-8601 strings
 * normalised with `toIsoDatetime`.
 *
 * Refs:
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-invoice-response.md
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { strMap } from './shared'

export interface RawPagarmeInvoiceItem {
  id?: string
  amount?: number
  description?: string
  quantity?: number
  pricing_scheme?: { price?: number; [k: string]: unknown }
  [k: string]: unknown
}

export interface RawPagarmeInvoice {
  id?: string
  code?: string
  url?: string
  amount?: number
  status?: string
  payment_method?: string
  subscription_id?: string
  subscription?: { id?: string; [k: string]: unknown }
  customer?: { id?: string; [k: string]: unknown }
  charge?: { id?: string; [k: string]: unknown }
  cycle?: {
    start_at?: string
    end_at?: string
    [k: string]: unknown
  }
  items?: RawPagarmeInvoiceItem[]
  created_at?: string
  due_at?: string
  canceled_at?: string
  billing_at?: string
  seen_at?: string
  total_discount?: number
  total_increment?: number
  metadata?: Record<string, string>
  [k: string]: unknown
}

/**
 * Map Pagar.me invoice status to canonical InvoiceStatus.
 * Pagar.me statuses: pending, paid, canceled, scheduled, failed
 */
function mapStatus(raw: string | undefined): InvoiceStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'canceled':
      return 'void'
    case 'pending':
    case 'scheduled':
      return 'open'
    case 'failed':
      return 'uncollectible'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawPagarmeInvoice): Invoice {
  const subscriptionId =
    raw.subscription_id ?? raw.subscription?.id ?? undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.code ?? raw.id ?? ''),
    number: raw.code ?? undefined,
    customerId: raw.customer?.id ? String(raw.customer.id) : undefined,
    subscriptionId: subscriptionId ? String(subscriptionId) : undefined,
    status: mapStatus(raw.status),
    currency: 'BRL', // Pagar.me is BRL-first; invoices don't always echo currency
    subtotal: raw.amount ?? 0,
    total: raw.amount ?? 0,
    amountPaid: raw.status === 'paid' ? (raw.amount ?? 0) : undefined,
    dueDate: toIsoDatetime(raw.due_at),
    paidAt: toIsoDatetime(raw.billing_at),
    periodStart: toIsoDatetime(raw.cycle?.start_at),
    periodEnd: toIsoDatetime(raw.cycle?.end_at),
    hostedInvoiceUrl: raw.url ?? undefined,
    lineItemIds: (raw.items ?? []).map((item) => String(item.id ?? '')).filter(Boolean),
    gateway: 'pagarme',
    metadata: strMap({
      ...raw.metadata,
      code: raw.code,
      payment_method: raw.payment_method,
      charge_id: raw.charge?.id,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.canceled_at ?? raw.billing_at ?? raw.created_at),
    raw,
  }
}
