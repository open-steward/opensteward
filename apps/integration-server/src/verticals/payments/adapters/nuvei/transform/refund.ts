/**
 * Nuvei refundTransaction response → canonical Refund.
 *
 * `refundTransaction.do` returns a single transaction whose
 * `relatedTransactionId` points back at the original Sale/Settle. The
 * financial outcome is in `transactionStatus` (APPROVED / DECLINED / ERROR).
 * Amounts arrive as decimal major-unit strings.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawNuveiRefund {
  transactionId?: string
  relatedTransactionId?: string
  clientUniqueId?: string
  clientRequestId?: string
  transactionStatus?: string
  status?: string
  amount?: string | number
  currency?: string
  authCode?: string
  errCode?: number
  reason?: string
  gwErrorReason?: string
  createdDate?: string
  updatedDate?: string
  [k: string]: unknown
}

function mapStatus(raw: RawNuveiRefund): RefundStatus {
  switch ((raw.transactionStatus ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'succeeded'
    case 'DECLINED':
    case 'ERROR':
      return 'failed'
    case 'PENDING':
      return 'pending'
    default:
      return (raw.status ?? '').toUpperCase() === 'SUCCESS' ? 'succeeded' : 'pending'
  }
}

export function transformRefund(raw: RawNuveiRefund): Refund {
  const id = raw.transactionId ?? raw.clientUniqueId ?? ''
  const failed = mapStatus(raw) === 'failed'
  return {
    id: String(id),
    externalId: String(id),
    chargeId: String(raw.relatedTransactionId ?? ''),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    failureReason: failed ? (raw.gwErrorReason ?? raw.reason ?? undefined) : undefined,
    gateway: 'nuvei',
    metadata: strMap({
      clientUniqueId: raw.clientUniqueId,
      authCode: raw.authCode,
      errCode: pickStr(raw.errCode),
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
