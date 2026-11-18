import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * Tingg refund-request response. A refund is raised against a prior request
 * (`merchant_transaction_id` + `payment_id`); the response echoes the
 * platform-assigned refund/reference identifiers and a status. Field names
 * are snake_case on the wire and amounts are major-unit decimals.
 */
export interface RawCellulantRefund {
  status?: { status_code?: number | string; status_description?: string }
  results?: RawCellulantRefundResult
  // Some refund responses inline the result fields at the top level.
  refund_id?: string | number
  refund_reference?: string
  merchant_transaction_id?: string
  payment_id?: string
  amount?: string | number
  currency_code?: string
  refund_status?: string | number
  refund_narration?: string
  date_created?: string
  [k: string]: unknown
}

interface RawCellulantRefundResult {
  refund_id?: string | number
  refund_reference?: string
  merchant_transaction_id?: string
  payment_id?: string
  amount?: string | number
  currency_code?: string
  refund_status?: string | number
  refund_narration?: string
  date_created?: string
  [k: string]: unknown
}

function mapStatus(statusCode: number | string | undefined, refundStatus: unknown): RefundStatus {
  const s = String(refundStatus ?? '').toLowerCase()
  if (s.includes('success') || s.includes('completed') || s.includes('refunded')) {
    return 'succeeded'
  }
  if (s.includes('fail') || s.includes('reject') || s.includes('declined')) return 'failed'
  if (s.includes('cancel')) return 'cancelled'
  // Fall back to the envelope status_code: 200 = logged successfully (pending settlement).
  if (Number(statusCode) === 200) return 'pending'
  return 'pending'
}

/**
 * Build the refund from a Tingg response. `chargeId`, `amount` and `currency`
 * are passed in from the request the caller submitted, since the response may
 * not echo every field — never throw on a missing optional.
 */
export function transformRefund(
  raw: RawCellulantRefund,
  fallback: { chargeId: string; amount?: number; currency?: string },
): Refund {
  const r: RawCellulantRefundResult = raw.results ?? raw
  const id = String(r.refund_id ?? r.refund_reference ?? raw.refund_reference ?? '')
  const amount =
    r.amount != null ? toMinorUnits(r.amount) : fallback.amount ?? 0
  return {
    id,
    externalId: pickStr(r.refund_reference ?? raw.refund_reference) ?? id,
    chargeId: pickStr(r.merchant_transaction_id ?? raw.merchant_transaction_id) ?? fallback.chargeId,
    amount,
    currency: pickCurrency(r.currency_code ?? fallback.currency),
    status: mapStatus(raw.status?.status_code, r.refund_status ?? raw.refund_status),
    gateway: 'cellulant',
    metadata: strMap({
      payment_id: r.payment_id ?? raw.payment_id,
      refund_narration: r.refund_narration ?? raw.refund_narration,
      status_code: raw.status?.status_code,
      status_description: raw.status?.status_description,
    }),
    createdAt: toIsoDatetime(r.date_created ?? raw.date_created),
    raw,
  }
}
