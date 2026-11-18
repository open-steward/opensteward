/**
 * Finix `Transfer` ↔ canonical `Charge`.
 *
 * In Finix every flow of funds is a `Transfer`. A `type: DEBIT` transfer is a
 * customer charge; `REVERSAL` transfers (refunds) are handled separately in
 * `refund.ts`. `state` is one of SUCCEEDED / PENDING / FAILED / CANCELED.
 * Amounts are integer minor units; `source` is the Payment Instrument the
 * funds were pulled from, `merchant_identity` the seller Identity.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { iso, pickCurrency, refId, strMap } from './shared'

export interface RawFinixTransfer {
  id?: string
  type?: string
  state?: string
  amount?: number
  amount_requested?: number
  currency?: string
  fee?: number
  source?: string | null
  destination?: string | null
  merchant?: string | null
  merchant_identity?: string | null
  statement_descriptor?: string | null
  trace_id?: string | null
  failure_code?: string | null
  failure_message?: string | null
  ready_to_settle_at?: string | null
  parent_transfer?: string | null
  subtype?: string | null
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFinixTransfer): ChargeStatus {
  switch ((raw.state ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'FAILED':
      return 'failed'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawFinixTransfer): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    captured: (raw.state ?? '').toUpperCase() === 'SUCCEEDED',
    customerId: refId(raw.merchant_identity),
    paymentMethodId: refId(raw.source),
    statementDescriptor: raw.statement_descriptor ?? undefined,
    failureCode: raw.failure_code ?? undefined,
    failureMessage: raw.failure_message ?? undefined,
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      type: raw.type,
      subtype: raw.subtype,
      fee: raw.fee,
      trace_id: raw.trace_id,
      merchant: refId(raw.merchant),
      ready_to_settle_at: raw.ready_to_settle_at,
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
