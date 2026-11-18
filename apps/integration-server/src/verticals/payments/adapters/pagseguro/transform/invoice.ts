import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { toIso, strMap } from './shared'

export interface RawStripeInvoice {
  id: string
  object: 'invoice'
  number?: string | null
  customer?: string | null
  subscription?: string | null
  status?: string | null
  currency: string
  subtotal?: number
  tax?: number | null
  total: number
  amount_due?: number
  amount_paid?: number
  amount_remaining?: number
  due_date?: number | null
  status_transitions?: { paid_at?: number | null } | null
  period_start?: number | null
  period_end?: number | null
  hosted_invoice_url?: string | null
  invoice_pdf?: string | null
  lines?: { data?: Array<{ id: string }> } | null
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

function mapStatus(raw: RawStripeInvoice): InvoiceStatus {
  switch (raw.status) {
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
      return 'open'
  }
}

export function transformInvoice(raw: RawStripeInvoice): Invoice {
  return {
    id: raw.id,
    externalId: raw.id,
    number: raw.number ?? undefined,
    customerId: raw.customer ?? undefined,
    subscriptionId: raw.subscription ?? undefined,
    status: mapStatus(raw),
    currency: raw.currency.toUpperCase(),
    subtotal: raw.subtotal,
    tax: raw.tax ?? undefined,
    total: raw.total,
    amountDue: raw.amount_due,
    amountPaid: raw.amount_paid,
    amountRemaining: raw.amount_remaining,
    dueDate: toIso(raw.due_date),
    paidAt: toIso(raw.status_transitions?.paid_at),
    periodStart: toIso(raw.period_start),
    periodEnd: toIso(raw.period_end),
    hostedInvoiceUrl: raw.hosted_invoice_url ?? undefined,
    invoicePdfUrl: raw.invoice_pdf ?? undefined,
    lineItemIds: raw.lines?.data?.map((l) => l.id),
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}

export function untransformInvoice(i: Partial<Invoice>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (i.customerId !== undefined) out.customer = i.customerId
  if (i.subscriptionId !== undefined) out.subscription = i.subscriptionId
  if (i.metadata) out.metadata = i.metadata
  return out
}
