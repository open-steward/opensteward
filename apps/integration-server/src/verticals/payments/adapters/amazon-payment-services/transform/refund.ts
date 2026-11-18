import type { Refund } from '../../../schema/refund'
import { isSuccessCode, pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * An APS refund is the response of a REFUND command. It carries a fresh
 * `fort_id` for the refund operation, the `merchant_reference` of the
 * original purchase/capture being refunded, the refunded `amount`, and a
 * 2-digit transaction `status` (06 = Refund Success).
 */
export interface RawApsRefund {
  fort_id?: string
  merchant_reference?: string
  command?: string
  status?: string
  response_code?: string
  response_message?: string
  amount?: string | number
  currency?: string
  maintenance_reference?: string
  /** fort_id of the original transaction being refunded. */
  original_fort_id?: string
  [k: string]: unknown
}

/** APS refund status code → canonical refund status. */
function mapStatus(raw: RawApsRefund): Refund['status'] {
  if (String(raw.status ?? '') === '06') return 'succeeded'
  if (isSuccessCode(raw.response_code)) return 'succeeded'
  if (raw.response_code) return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawApsRefund): Refund {
  return {
    id: String(raw.fort_id ?? raw.maintenance_reference ?? ''),
    externalId: String(raw.fort_id ?? raw.maintenance_reference ?? ''),
    chargeId: String(raw.original_fort_id ?? raw.merchant_reference ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    failureReason:
      mapStatus(raw) === 'failed' ? (raw.response_message ?? undefined) : undefined,
    gateway: 'amazon-payment-services',
    metadata: strMap({
      merchant_reference: raw.merchant_reference,
      maintenance_reference: raw.maintenance_reference,
      response_code: raw.response_code,
      response_message: raw.response_message,
    }),
    raw,
  }
}
