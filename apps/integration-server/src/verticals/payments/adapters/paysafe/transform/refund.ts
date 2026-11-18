import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap } from './shared'

/**
 * A Paysafe **Refund** (a credit against a settlement) maps onto the canonical
 * **Refund**. The charge it offsets is referenced by the parent settlement /
 * payment; Paysafe surfaces that via `settlementId` (and the originating
 * `merchantRefNum`).
 */
export interface RawPaysafeRefund {
  id?: string
  merchantRefNum?: string
  amount?: number
  currencyCode?: string
  status?: string
  settlementId?: string
  childAccountNum?: string
  txnTime?: string
  updatedTime?: string
  error?: { code?: string; message?: string }
  [k: string]: unknown
}

/** Refund states: RECEIVED, PENDING, COMPLETED, FAILED, CANCELLED. */
function mapStatus(raw: RawPaysafeRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'succeeded'
    case 'PENDING':
    case 'RECEIVED':
    case 'PROCESSING':
    case 'INITIATED':
      return 'pending'
    case 'FAILED':
    case 'ERROR':
      return 'failed'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawPaysafeRefund): Refund {
  return {
    id: String(raw.id ?? raw.merchantRefNum ?? ''),
    externalId: String(raw.id ?? raw.merchantRefNum ?? ''),
    chargeId: String(raw.settlementId ?? raw.merchantRefNum ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currencyCode) ?? 'USD',
    status: mapStatus(raw),
    failureReason: pickStr(raw.error?.message),
    gateway: 'paysafe',
    metadata: strMap({
      merchantRefNum: raw.merchantRefNum,
      settlementId: raw.settlementId,
      childAccountNum: raw.childAccountNum,
    }),
    createdAt: toIsoDatetime(raw.txnTime),
    updatedAt: toIsoDatetime(raw.updatedTime ?? raw.txnTime),
    raw,
  }
}
