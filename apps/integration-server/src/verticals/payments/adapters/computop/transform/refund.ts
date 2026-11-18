import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickAmount, pickCurrency, pickStr, strMap, toIso } from './shared'

/**
 * Computop refund-operation response. A refund is an operation on the parent
 * payment, so it echoes the parent `payId`; the `refNr` is the merchant's own
 * per-operation reference. `xId` is Computop's operation-level identifier.
 */
export interface RawComputopRefund {
  payId?: string
  xId?: string
  merchantId?: string
  transId?: string
  refNr?: string
  status?: string
  responseCode?: string
  responseDescription?: string
  amount?: { value?: number; currency?: string }
  createdAt?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawComputopRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'OK':
    case 'REFUNDED':
    case 'SUCCESS':
      return 'succeeded'
    case 'FAILED':
    case 'ERROR':
      return 'failed'
    case 'CANCELLED':
    case 'CANCELED':
    case 'VOID':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawComputopRefund, chargeId?: string): Refund {
  const id = pickStr(raw.xId) ?? pickStr(raw.refNr) ?? pickStr(raw.transId) ?? ''
  return {
    id,
    externalId: id,
    chargeId: chargeId ?? pickStr(raw.payId) ?? '',
    amount: pickAmount(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    failureReason:
      (raw.status ?? '').toUpperCase() === 'FAILED' ? pickStr(raw.responseDescription) : undefined,
    gateway: 'computop',
    metadata: strMap({
      transId: raw.transId,
      refNr: raw.refNr,
      responseCode: raw.responseCode,
    }),
    createdAt: toIso(raw.createdAt),
    raw,
  }
}
