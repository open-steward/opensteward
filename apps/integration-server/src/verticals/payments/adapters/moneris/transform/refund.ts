import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { customDataToMetadata, required, type MonerisCustomData, type MonerisMoney } from './shared'

/** `refundStatus`: `"enum": ["DECLINED", "DECLINED_RETRY", "PROCESSING", "SUCCEEDED"]`. */
export type MonerisRefundStatus = 'DECLINED' | 'DECLINED_RETRY' | 'PROCESSING' | 'SUCCEEDED'

/**
 * `refund` (Moneris API 2.15.1,
 * https://developer.moneris.com/moneris-api/reference/getrefunds.md), the
 * fields read here. `"required": ["refundId", "merchantId", "paymentMethod",
 * "createdAt", "refundAmount", "refundStatus", "transactionDetails"]`.
 */
export interface RawMonerisRefund {
  refundId: string
  /** "Payment reference." nullable; `"required": ["paymentId"]`. */
  payment?: { paymentId: string } | null
  merchantId: string
  createdAt: string
  modifiedAt?: string | null
  /** "Refund amount for the transaction. Note: The value must be in cents." */
  refundAmount: MonerisMoney
  refundStatus: MonerisRefundStatus
  customData?: MonerisCustomData
  [k: string]: unknown
}

const STATUS: Record<MonerisRefundStatus, RefundStatus> = {
  SUCCEEDED: 'succeeded',
  PROCESSING: 'pending',
  DECLINED: 'failed',
  DECLINED_RETRY: 'failed',
}

/**
 * A refund with no `payment` (Create Refund: "For independent refunds, no
 * payment Id is required") has no charge id, which the canonical refund
 * requires, so it throws rather than invent one.
 */
export function transformRefund(raw: RawMonerisRefund): Refund {
  const id = required(raw.refundId, 'refund.refundId')
  const amount = required(raw.refundAmount, 'refund.refundAmount')
  return {
    id,
    externalId: id,
    chargeId: required(raw.payment?.paymentId, `refund ${id} payment.paymentId`),
    amount: required(amount.amount, 'refund.refundAmount.amount'),
    currency: required(amount.currency, 'refund.refundAmount.currency'),
    status: STATUS[raw.refundStatus] ?? 'unknown',
    gateway: 'moneris',
    metadata: customDataToMetadata(raw.customData),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.modifiedAt),
    raw,
  }
}
