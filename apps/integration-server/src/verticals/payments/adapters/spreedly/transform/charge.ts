import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

/**
 * A Spreedly transaction. The money-movement types (Purchase, Authorization,
 * Capture) map onto the canonical Charge; refund-shaped types (Credit, Refund,
 * Void) are handled by the refund transform instead.
 *
 * Docs: https://docs.spreedly.com/reference/api/v1/transactions/
 */
export interface RawSpreedlyTransaction {
  token?: string
  transaction_type?: string
  state?: string
  succeeded?: boolean
  amount?: number
  currency_code?: string
  message?: string
  description?: string
  email?: string
  order_id?: string
  retained?: boolean
  on_test_gateway?: boolean
  gateway_token?: string
  reference_token?: string
  response?: {
    success?: boolean
    message?: string
    error_code?: string
    error_detail?: string
    cancelled?: boolean
  } | null
  payment_method?: { token?: string; email?: string } | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

/**
 * Spreedly carries outcome on both `state` and the boolean `succeeded`.
 * `state` is the richer signal: `succeeded`, `gateway_processing_failed`,
 * `pending`, `processing`. A voided authorization surfaces as
 * `transaction_type: Void` upstream, but a Purchase/Authorization whose
 * `response.cancelled` is set lands here too.
 */
function mapStatus(raw: RawSpreedlyTransaction): ChargeStatus {
  const state = (raw.state ?? '').toLowerCase()
  if (state === 'succeeded') return 'succeeded'
  if (state === 'pending' || state === 'processing') return 'pending'
  if (
    state === 'gateway_processing_failed' ||
    state === 'failed' ||
    state === 'gateway_processing_result_unknown'
  ) {
    return 'failed'
  }
  if (raw.response?.cancelled) return 'cancelled'
  if (raw.succeeded === true) return 'succeeded'
  if (raw.succeeded === false) return 'failed'
  return 'pending'
}

export function transformCharge(raw: RawSpreedlyTransaction): Charge {
  const token = raw.token ?? ''
  const failed = raw.succeeded === false || mapStatus(raw) === 'failed'
  const failureMessage = failed
    ? (raw.response?.message ?? raw.response?.error_detail ?? raw.message)
    : undefined
  return {
    id: token,
    externalId: token,
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency_code) ?? 'USD',
    status: mapStatus(raw),
    captured: (raw.transaction_type ?? '').toLowerCase() !== 'authorization',
    paymentMethodId: raw.payment_method?.token ?? undefined,
    description: raw.description ?? undefined,
    failureCode: failed ? (raw.response?.error_code ?? undefined) : undefined,
    failureMessage: failureMessage ?? undefined,
    receiptEmail: raw.email ?? raw.payment_method?.email ?? undefined,
    gateway: 'spreedly',
    metadata: strMap({
      transaction_type: raw.transaction_type,
      state: raw.state,
      gateway_token: raw.gateway_token,
      order_id: raw.order_id,
      retained: raw.retained,
      on_test_gateway: raw.on_test_gateway,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
