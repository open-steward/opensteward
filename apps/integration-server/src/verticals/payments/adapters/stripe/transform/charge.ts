import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIso, strMap } from './shared'

export interface RawStripeCharge {
  id: string
  object: 'charge'
  amount: number
  amount_captured?: number
  amount_refunded?: number
  currency: string
  captured?: boolean
  status: string
  paid?: boolean
  refunded?: boolean
  disputed?: boolean
  customer?: string | null
  payment_method?: string | null
  payment_intent?: string | null
  invoice?: string | null
  description?: string | null
  statement_descriptor?: string | null
  failure_code?: string | null
  failure_message?: string | null
  receipt_url?: string | null
  receipt_email?: string | null
  refunds?: { data?: Array<{ id: string }> } | null
  disputes?: Array<{ id: string }>
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

function mapStatus(raw: RawStripeCharge): ChargeStatus {
  if (raw.disputed) return 'disputed'
  if (raw.refunded) return 'refunded'
  const refunded = raw.amount_refunded ?? 0
  if (refunded > 0 && refunded < raw.amount) return 'partially_refunded'
  if (raw.status === 'succeeded') return 'succeeded'
  if (raw.status === 'failed') return 'failed'
  if (raw.status === 'pending') return 'pending'
  return 'pending'
}

export function transformCharge(raw: RawStripeCharge): Charge {
  return {
    id: raw.id,
    externalId: raw.id,
    amount: raw.amount,
    currency: raw.currency.toUpperCase(),
    amountRefunded: raw.amount_refunded ?? undefined,
    amountCaptured: raw.amount_captured ?? undefined,
    status: mapStatus(raw),
    captured: raw.captured,
    customerId: raw.customer ?? undefined,
    paymentMethodId: raw.payment_method ?? undefined,
    invoiceId: raw.invoice ?? undefined,
    description: raw.description ?? undefined,
    statementDescriptor: raw.statement_descriptor ?? undefined,
    failureCode: raw.failure_code ?? undefined,
    failureMessage: raw.failure_message ?? undefined,
    receiptUrl: raw.receipt_url ?? undefined,
    receiptEmail: raw.receipt_email ?? undefined,
    refundIds: raw.refunds?.data?.map((r) => r.id),
    disputeIds: raw.disputes?.map((d) => d.id),
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}

export function untransformCharge(c: Partial<Charge>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.amount !== undefined) out.amount = c.amount
  if (c.currency !== undefined) out.currency = c.currency.toLowerCase()
  if (c.customerId !== undefined) out.customer = c.customerId
  if (c.paymentMethodId !== undefined) out.source = c.paymentMethodId
  if (c.description !== undefined) out.description = c.description
  if (c.statementDescriptor !== undefined) out.statement_descriptor = c.statementDescriptor
  if (c.receiptEmail !== undefined) out.receipt_email = c.receiptEmail
  if (c.metadata) out.metadata = c.metadata
  return out
}
