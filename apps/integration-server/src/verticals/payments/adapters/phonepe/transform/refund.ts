import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Shape returned by both the Initiate-Refund response (sparse — `refundId`
 * / `amount` / `state`) and the richer Refund-Status response (adds
 * `merchantRefundId` / `originalMerchantOrderId` / `timestamp` /
 * error codes / `paymentDetails`).
 */
export interface RawPhonepeRefund {
  refundId?: string
  merchantRefundId?: string
  originalMerchantOrderId?: string
  amount?: number
  state?: string
  timestamp?: number
  errorCode?: string | null
  detailedErrorCode?: string | null
  paymentDetails?: Array<{
    transactionId?: string
    paymentMode?: string
    timestamp?: number
    state?: string
    [k: string]: unknown
  }>
  [k: string]: unknown
}

function mapStatus(state: string | undefined): RefundStatus {
  const s = (state ?? '').toUpperCase()
  // COMPLETED is the terminal-success state; CONFIRMED is the equivalent for
  // split-settlement refunds.
  if (s === 'COMPLETED' || s === 'CONFIRMED') return 'succeeded'
  if (s === 'FAILED') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawPhonepeRefund): Refund {
  return {
    id: String(raw.merchantRefundId ?? raw.refundId ?? ''),
    externalId: String(raw.refundId ?? raw.merchantRefundId ?? ''),
    chargeId: String(raw.originalMerchantOrderId ?? ''),
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(undefined),
    status: mapStatus(raw.state),
    failureReason: raw.errorCode ?? raw.detailedErrorCode ?? undefined,
    gateway: 'phonepe',
    metadata: strMap({
      refundId: raw.refundId,
      merchantRefundId: raw.merchantRefundId,
      detailedErrorCode: raw.detailedErrorCode,
    }),
    createdAt: toIsoDatetime(raw.timestamp),
    raw,
  }
}
