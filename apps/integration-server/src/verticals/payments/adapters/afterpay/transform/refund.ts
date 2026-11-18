import type { Refund } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawAfterpayRefund {
  refundId?: string
  orderId?: string
  amount?: { amount?: string; currency?: string }
  refundMerchantReference?: string
  refundedAt?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawAfterpayRefund): Refund {
  return {
    id: String(raw.refundId ?? ''),
    externalId: String(raw.refundId ?? ''),
    chargeId: String(raw.orderId ?? ''),
    amount: decimalToMinor(raw.amount?.amount),
    currency: pickCurrency(raw.amount?.currency),
    status: 'succeeded',
    gateway: 'afterpay',
    metadata: strMap({ merchant_reference: raw.refundMerchantReference }),
    createdAt: raw.refundedAt,
    raw,
  }
}
