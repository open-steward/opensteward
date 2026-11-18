import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/** Shape of the `POST /payment/refund` response. */
export interface RawIyzicoRefund {
  status?: string
  paymentId?: string | number
  /** Refund is executed over a basket item, identified by paymentTransactionId. */
  paymentTransactionId?: string | number
  price?: number | string
  currency?: string
  authCode?: string
  hostReference?: string
  refundHostReference?: string
  retryable?: boolean
  conversationId?: string
  systemTime?: number
  errorCode?: string
  errorMessage?: string
  [k: string]: unknown
}

export function transformRefund(raw: RawIyzicoRefund): Refund {
  const success = (raw.status ?? '').toLowerCase() === 'success'
  // iyzico has no standalone refund id; the basket-item transaction id is the
  // stable handle, falling back to the bank refund reference.
  const refundRef = String(
    raw.refundHostReference ?? raw.paymentTransactionId ?? raw.hostReference ?? '',
  )

  return {
    id: refundRef,
    externalId: refundRef,
    chargeId: String(raw.paymentId ?? ''),
    amount: toMinorUnits(raw.price) ?? 0,
    currency: pickCurrency(raw.currency),
    status: success ? 'succeeded' : 'failed',
    failureReason: success ? undefined : raw.errorMessage,
    gateway: 'iyzico',
    metadata: strMap({
      paymentTransactionId: raw.paymentTransactionId,
      authCode: raw.authCode,
      hostReference: raw.hostReference,
      refundHostReference: raw.refundHostReference,
      conversationId: raw.conversationId,
      retryable: raw.retryable,
    }),
    createdAt: toIsoDatetime(raw.systemTime),
    raw,
  }
}
