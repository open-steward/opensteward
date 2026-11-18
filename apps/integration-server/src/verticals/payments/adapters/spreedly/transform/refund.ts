import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

/**
 * In Spreedly a refund is itself a transaction with `transaction_type`
 * `Credit` (partial/standalone) or `Refund`, linked back to the original
 * money-movement transaction via `reference_token`. There is no standalone
 * `/refunds` collection — refund-type transactions surface in the same
 * `/transactions` list — so only `createRefund` is implemented, which issues
 * `POST /transactions/{token}/credit.json` against the original charge.
 *
 * Docs: https://docs.spreedly.com/reference/api/v1/transactions/
 */
export interface RawSpreedlyRefund {
  token?: string
  transaction_type?: string
  state?: string
  succeeded?: boolean
  amount?: number
  currency_code?: string
  reference_token?: string
  message?: string
  response?: { message?: string; error_detail?: string } | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawSpreedlyRefund): RefundStatus {
  const state = (raw.state ?? '').toLowerCase()
  if (state === 'succeeded' || raw.succeeded === true) return 'succeeded'
  if (state === 'pending' || state === 'processing') return 'pending'
  if (raw.succeeded === false || state.includes('failed')) return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawSpreedlyRefund): Refund {
  const token = raw.token ?? ''
  const status = mapStatus(raw)
  return {
    id: token,
    externalId: token,
    chargeId: raw.reference_token ?? '',
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency_code) ?? 'USD',
    status,
    failureReason:
      status === 'failed'
        ? (raw.response?.message ?? raw.response?.error_detail ?? raw.message ?? undefined)
        : undefined,
    gateway: 'spreedly',
    metadata: strMap({ transaction_type: raw.transaction_type, state: raw.state }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
