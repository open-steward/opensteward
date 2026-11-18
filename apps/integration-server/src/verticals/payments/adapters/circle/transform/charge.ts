import type { Charge, ChargeStatus } from '../../../schema/charge'
import { type CircleMoney, pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * Circle Mint payment object (`GET /v1/payments`, `GET /v1/payments/{id}`).
 * `type` distinguishes inbound payments from refund / cancel records; this
 * adapter maps `type: 'payment'` records to canonical charges.
 *
 * Docs: https://developers.circle.com/api-reference/circle-mint/payments/get-payment
 */
export interface RawCirclePayment {
  id?: string
  type?: 'payment' | 'refund' | 'cancel'
  merchantId?: string
  merchantWalletId?: string
  source?: { id?: string; type?: string }
  description?: string
  amount?: CircleMoney
  fees?: CircleMoney
  status?: string
  captured?: boolean
  captureAmount?: CircleMoney
  refunds?: Array<{ id?: string }>
  trackingRef?: string
  externalRef?: string
  errorCode?: string
  metadata?: { email?: string; phoneNumber?: string }
  createDate?: string
  updateDate?: string
  [k: string]: unknown
}

/** Map a Circle payment `status` onto the canonical {@link ChargeStatus}. */
function mapStatus(raw: RawCirclePayment): ChargeStatus {
  const refunded = (raw.refunds?.length ?? 0) > 0
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
    case 'confirmed':
      return refunded ? 'refunded' : 'succeeded'
    case 'pending':
    case 'action_required':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawCirclePayment): Charge {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount?.amount) ?? 0,
    currency: pickCurrency(raw.amount?.currency),
    amountCaptured: toMinorUnits(raw.captureAmount?.amount),
    status: mapStatus(raw),
    captured: raw.captured,
    customerId: raw.source?.id,
    description: raw.description,
    failureCode: raw.errorCode,
    receiptEmail: raw.metadata?.email,
    refundIds: raw.refunds?.map((r) => String(r.id ?? '')).filter(Boolean),
    gateway: 'circle',
    metadata: strMap({
      type: raw.type,
      merchantWalletId: raw.merchantWalletId,
      sourceType: raw.source?.type,
      trackingRef: raw.trackingRef,
      externalRef: raw.externalRef,
      phoneNumber: raw.metadata?.phoneNumber,
    }),
    createdAt: toIsoDatetime(raw.createDate),
    updatedAt: toIsoDatetime(raw.updateDate),
    raw,
  }
}
