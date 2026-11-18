import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { mapListStatus, pickCurrency, paytmToIso, strMap, toMinorUnits } from './shared'

/**
 * Paytm Transaction Status (`POST /v3/order/status`) `body` — used by
 * `getCharge`, which fetches a single charge by its `orderId`. The merchant
 * `orderId` is the stable canonical id; `txnId` is Paytm's gateway
 * transaction id. `listCharges` reads a differently-shaped row from the
 * Order List API instead — see `RawPaytmOrderListRow`/`transformChargeListItem`
 * below.
 */
export interface RawPaytmTxn {
  resultInfo?: {
    resultStatus?: string
    resultCode?: string
    resultMsg?: string
  }
  txnId?: string
  bankTxnId?: string
  orderId?: string
  txnAmount?: string | number
  txnType?: string
  gatewayName?: string
  bankName?: string
  mid?: string
  paymentMode?: string
  refundAmt?: string | number
  txnDate?: string
  currency?: string
  [k: string]: unknown
}

/** Map a Paytm `resultStatus` to the canonical charge status. */
function mapStatus(raw: RawPaytmTxn): ChargeStatus {
  const status = (raw.resultInfo?.resultStatus ?? '').toUpperCase()
  switch (status) {
    case 'TXN_SUCCESS':
      return 'succeeded'
    case 'TXN_FAILURE':
      return 'failed'
    case 'PENDING':
      return 'pending'
    case 'NO_RECORD_FOUND':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPaytmTxn): Charge {
  const status = mapStatus(raw)
  const id = String(raw.orderId ?? raw.txnId ?? '')
  const refundAmt = toMinorUnits(raw.refundAmt)
  const createdAt = paytmToIso(raw.txnDate)
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.txnAmount),
    currency: pickCurrency(raw.currency),
    amountRefunded: refundAmt > 0 ? refundAmt : undefined,
    status,
    captured: status === 'succeeded' ? true : undefined,
    capturedAt: status === 'succeeded' ? toIsoDatetime(createdAt) : undefined,
    failureMessage: status === 'failed' ? raw.resultInfo?.resultMsg ?? undefined : undefined,
    failureCode: status === 'failed' ? raw.resultInfo?.resultCode ?? undefined : undefined,
    gateway: 'paytm',
    metadata: strMap({
      txnId: raw.txnId,
      bankTxnId: raw.bankTxnId,
      txnType: raw.txnType,
      gatewayName: raw.gatewayName,
      bankName: raw.bankName,
      paymentMode: raw.paymentMode,
      mid: raw.mid,
      resultCode: raw.resultInfo?.resultCode,
      resultStatus: raw.resultInfo?.resultStatus,
    }),
    createdAt: toIsoDatetime(createdAt),
    updatedAt: toIsoDatetime(createdAt),
    raw,
  }
}

/**
 * Order List API (`POST /merchant-passbook/search/list/order/v2`) row —
 * `body.orders[]`. Shape differs from `RawPaytmTxn` above: status is the
 * flat `orderSearchStatus` (SUCCESS/FAILURE/PENDING), not
 * `resultInfo.resultStatus` (TXN_SUCCESS/TXN_FAILURE); the amount field is
 * `amount`, not `txnAmount`; and the canonical order id is `merchantOrderId`.
 */
export interface RawPaytmOrderListRow {
  merchantOrderId?: string
  txnId?: string
  orderCreatedTime?: string
  orderCompletedTime?: string
  orderSearchType?: string
  orderSearchStatus?: string
  amount?: string | number
  payMode?: string
  vanId?: string
  vanIfscCode?: string
  rrn?: string
  mid?: string
  merchantName?: string
  [k: string]: unknown
}

export function transformChargeListItem(raw: RawPaytmOrderListRow): Charge {
  const status = mapListStatus(raw.orderSearchStatus)
  const id = String(raw.merchantOrderId ?? raw.txnId ?? '')
  const createdAt = paytmToIso(raw.orderCreatedTime)
  const completedAt = paytmToIso(raw.orderCompletedTime ?? raw.orderCreatedTime)
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(undefined),
    status,
    captured: status === 'succeeded' ? true : undefined,
    capturedAt: status === 'succeeded' ? toIsoDatetime(completedAt) : undefined,
    gateway: 'paytm',
    metadata: strMap({
      txnId: raw.txnId,
      payMode: raw.payMode,
      vanId: raw.vanId,
      vanIfscCode: raw.vanIfscCode,
      rrn: raw.rrn,
      mid: raw.mid,
      merchantName: raw.merchantName,
      orderSearchType: raw.orderSearchType,
      orderSearchStatus: raw.orderSearchStatus,
    }),
    createdAt: toIsoDatetime(createdAt),
    updatedAt: toIsoDatetime(completedAt),
    raw,
  }
}
