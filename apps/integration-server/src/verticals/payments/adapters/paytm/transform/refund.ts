import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { mapListStatus, pickCurrency, paytmToIso, strMap, toMinorUnits } from './shared'

/**
 * Paytm refund object — the `body` of both Refund (`POST /refund/apply`) and
 * Refund Status (`POST /v2/refund/status`). `refId` is the merchant-assigned
 * reference; `refundId` is Paytm's. Canonical `chargeId` is the `orderId` the
 * refund was raised against (Paytm refunds are scoped to an order + txn).
 */
export interface RawPaytmRefund {
  resultInfo?: {
    resultStatus?: string
    resultCode?: string
    resultMsg?: string
  }
  refundId?: string
  txnId?: string
  orderId?: string
  refId?: string
  mid?: string
  refundAmount?: string | number
  txnAmount?: string | number
  refundType?: string
  currency?: string
  txnTimestamp?: string
  acceptRefundTimestamp?: string
  userCreditExpectedDate?: string
  [k: string]: unknown
}

function mapStatus(raw: RawPaytmRefund): RefundStatus {
  const status = (raw.resultInfo?.resultStatus ?? '').toUpperCase()
  switch (status) {
    case 'TXN_SUCCESS':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'TXN_FAILURE':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawPaytmRefund): Refund {
  const id = String(raw.refundId ?? raw.refId ?? '')
  const status = mapStatus(raw)
  const created = paytmToIso(raw.acceptRefundTimestamp ?? raw.txnTimestamp)
  return {
    id,
    externalId: id,
    chargeId: String(raw.orderId ?? raw.txnId ?? ''),
    amount: toMinorUnits(raw.refundAmount),
    currency: pickCurrency(raw.currency),
    status,
    failureReason: status === 'failed' ? raw.resultInfo?.resultMsg ?? undefined : undefined,
    gateway: 'paytm',
    metadata: strMap({
      refId: raw.refId,
      txnId: raw.txnId,
      mid: raw.mid,
      refundType: raw.refundType,
      txnAmount: raw.txnAmount,
      userCreditExpectedDate: raw.userCreditExpectedDate,
      resultCode: raw.resultInfo?.resultCode,
      resultStatus: raw.resultInfo?.resultStatus,
    }),
    createdAt: toIsoDatetime(created),
    updatedAt: toIsoDatetime(created),
    raw,
  }
}

/**
 * Refund List API (`POST /merchant-passbook/api/v1/refundList`) row —
 * `body.orders[]` of the flat (no `{head,body}` envelope) response. Note
 * the timestamp field is `acceptRefundTimeStamp` (capital `S`), unlike the
 * single-lookup endpoints' `acceptRefundTimestamp` (lowercase `s`) read by
 * `transformRefund` above — a genuine vendor inconsistency, not a typo here.
 */
export interface RawPaytmRefundListRow {
  orderId?: string
  refId?: string
  refundId?: string
  mid?: string
  txnAmount?: string | number
  refundAmount?: string | number
  txnTimeStamp?: string
  merchantRefundRequestTimeStamp?: string
  acceptRefundTimeStamp?: string
  acceptRefundStatus?: string
  [k: string]: unknown
}

/**
 * `id`/`externalId` are the composite `"<orderId>:<refId>"` — not the raw
 * `refundId` — so a row from `listRefunds` round-trips into `getRefund(id)`,
 * which requires that composite shape (see `splitRefundId` in `../index.ts`).
 * The true Paytm-issued `refundId` still rides along in `metadata`.
 */
export function transformRefundListItem(raw: RawPaytmRefundListRow): Refund {
  const orderId = String(raw.orderId ?? '')
  const refId = String(raw.refId ?? '')
  const id = `${orderId}:${refId}`
  const status = mapListStatus(raw.acceptRefundStatus)
  const created = paytmToIso(raw.acceptRefundTimeStamp ?? raw.txnTimeStamp)
  return {
    id,
    externalId: id,
    chargeId: orderId,
    amount: toMinorUnits(raw.refundAmount),
    currency: pickCurrency(undefined),
    status,
    gateway: 'paytm',
    metadata: strMap({
      refId: raw.refId,
      refundId: raw.refundId,
      mid: raw.mid,
      txnAmount: raw.txnAmount,
      merchantRefundRequestTimeStamp: raw.merchantRefundRequestTimeStamp,
      acceptRefundStatus: raw.acceptRefundStatus,
    }),
    createdAt: toIsoDatetime(created),
    updatedAt: toIsoDatetime(created),
    raw,
  }
}
