import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { customDataToMetadata, required, type MonerisCustomData, type MonerisMoney } from './shared'

/**
 * `paymentStatus`: `"enum": ["CANCELED", "DECLINED", "DECLINED_RETRY",
 * "AUTHORIZED", "PROCESSING", "SUCCEEDED", "INCREMENTED", "PARTIALLY_COMPLETED"]`.
 */
export type MonerisPaymentStatus =
  | 'CANCELED'
  | 'DECLINED'
  | 'DECLINED_RETRY'
  | 'AUTHORIZED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'INCREMENTED'
  | 'PARTIALLY_COMPLETED'

/**
 * `payment` (Moneris API 2.15.1,
 * https://developer.moneris.com/moneris-api/reference/getpayments.md), the
 * fields read here. `"required": ["paymentId", "merchantId",
 * "transactionDateTime", "createdAt", "amount", "authorizedAmount",
 * "capturableAmount", "paymentMethod", "paymentStatus", "transactionDetails",
 * "verificationDetails"]`.
 */
export interface RawMonerisPayment {
  paymentId: string
  merchantId: string
  orderId?: string | null
  createdAt: string
  modifiedAt?: string | null
  /** "This amount excludes surcharge, application and convenience fee." */
  amount: MonerisMoney
  customerId?: string | null
  paymentMethod?: { paymentMethodId?: string } | null
  paymentStatus: MonerisPaymentStatus
  /** "Refund details if any has occured." */
  refundDetails?: {
    refunds?: Array<{ refundId: string }>
    refundedAmount: MonerisMoney
  } | null
  /** "Subscription reference, if this transaction is related to a subscription." */
  subscription?: { subscriptionId: string } | null
  customData?: MonerisCustomData
  [k: string]: unknown
}

const STATUS: Record<MonerisPaymentStatus, ChargeStatus> = {
  SUCCEEDED: 'succeeded',
  // "Complete Payment: This will effectively capture a payment that has been authorized."
  PARTIALLY_COMPLETED: 'succeeded',
  DECLINED: 'failed',
  DECLINED_RETRY: 'failed',
  CANCELED: 'cancelled',
  AUTHORIZED: 'pending',
  PROCESSING: 'pending',
  // "Increases the locked amount of funds in an existing pre-authorization"
  INCREMENTED: 'pending',
}

export function transformCharge(raw: RawMonerisPayment): Charge {
  const id = required(raw.paymentId, 'payment.paymentId')
  const amount = required(raw.amount, 'payment.amount')
  const refunds = raw.refundDetails?.refunds?.map((r) => r.refundId)
  return {
    id,
    externalId: id,
    amount: required(amount.amount, 'payment.amount.amount'),
    currency: required(amount.currency, 'payment.amount.currency'),
    amountRefunded: raw.refundDetails?.refundedAmount?.amount,
    status: STATUS[raw.paymentStatus] ?? 'unknown',
    customerId: raw.customerId ?? undefined,
    paymentMethodId: raw.paymentMethod?.paymentMethodId ?? undefined,
    subscriptionId: raw.subscription?.subscriptionId ?? undefined,
    refundIds: refunds && refunds.length > 0 ? refunds : undefined,
    gateway: 'moneris',
    metadata: customDataToMetadata(raw.customData),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.modifiedAt),
    raw,
  }
}
