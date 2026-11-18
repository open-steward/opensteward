/**
 * Midtrans refunds are taken against a transaction (`POST /v2/{order_id}/refund`).
 * The response echoes a transaction-shaped body whose `transaction_status`
 * becomes `refund` (full) or `partial_refund`, carrying the new
 * `refund_amount` and a `refunds[]` array of refund lines. Each refund line
 * has `refund_chargeback_id`, `refund_amount` (decimal string, major units),
 * `refund_key` (merchant reference), `reason`, `created_at`/`bank_confirmed_at`
 * (`"YYYY-MM-DD HH:MM:SS"`), and `refund_method`.
 *
 * There is no standalone refund list/get endpoint, so the adapter only
 * implements `createRefund`. The canonical refund id is the
 * `refund_chargeback_id` (falling back to the `refund_key`), and `chargeId`
 * is the parent transaction's `order_id`.
 *
 * Refs:
 *   https://docs.midtrans.com/reference/refund-transaction
 *   https://docs.midtrans.com/reference/direct-refund-transaction
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { midtransWib, pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawMidtransRefundLine {
  refund_chargeback_id?: number | string
  refund_amount?: string
  refund_key?: string
  reason?: string
  refund_method?: string
  created_at?: string
  bank_confirmed_at?: string
  [k: string]: unknown
}

/** The refunded transaction echoed back by POST /v2/{id}/refund. */
export interface RawMidtransRefundResponse {
  status_code?: string
  status_message?: string
  transaction_id?: string
  order_id?: string
  payment_type?: string
  transaction_time?: string
  transaction_status?: string
  gross_amount?: string
  currency?: string
  refund_amount?: string
  refund_chargeback_id?: number | string
  refund_key?: string
  refunds?: RawMidtransRefundLine[]
  [k: string]: unknown
}

/**
 * Pull the freshest refund line + parent order context out of a refund
 * response. Midtrans returns the per-line fields flat on the response body
 * (single-refund case) and/or in a `refunds[]` array (notification case); we
 * prefer the newest array entry and synthesise a line from the flat fields
 * when the array is absent. Returns `undefined` only when nothing usable
 * exists (the caller never relies on it for control flow).
 */
export function extractRefund(
  res: RawMidtransRefundResponse,
): { line: RawMidtransRefundLine; orderId: string; orderCurrency?: string } | undefined {
  const orderId = String(res.order_id ?? res.transaction_id ?? '')
  const lines = res.refunds ?? []
  let latest: RawMidtransRefundLine | undefined
  for (const line of lines) {
    const t = Date.parse(String(line.created_at ?? '').replace(' ', 'T')) || 0
    const bestT = Date.parse(String(latest?.created_at ?? '').replace(' ', 'T')) || 0
    if (!latest || t >= bestT) latest = line
  }
  if (!latest) {
    // Single-refund response: the line fields live flat on the body.
    if (res.refund_amount == null && res.refund_chargeback_id == null && res.refund_key == null) {
      return undefined
    }
    latest = {
      refund_chargeback_id: res.refund_chargeback_id,
      refund_amount: res.refund_amount,
      refund_key: res.refund_key,
      created_at: res.transaction_time,
    }
  }
  return { line: latest, orderId, orderCurrency: res.currency }
}

/**
 * Refund lines have no per-line status — a line present on a successful
 * refund response is approved. The response-level `status_code` (`200`/`201`
 * = approved, `202` = pending bank confirmation) refines that.
 */
function mapStatus(statusCode: string | undefined): RefundStatus {
  switch (statusCode) {
    case '200':
    case '201':
      return 'succeeded'
    case '202':
      return 'pending'
    default:
      return 'succeeded'
  }
}

export function transformRefund(
  line: RawMidtransRefundLine,
  orderId: string,
  orderCurrency: string | undefined,
  statusCode?: string,
): Refund {
  const id = String(line.refund_chargeback_id ?? line.refund_key ?? '')
  return {
    id,
    externalId: id,
    chargeId: orderId,
    amount: toMinorUnits(line.refund_amount),
    currency: pickCurrency(orderCurrency),
    status: mapStatus(statusCode),
    reason: line.reason ? 'other' : undefined,
    gateway: 'midtrans',
    metadata: strMap({
      refund_key: line.refund_key,
      refund_method: line.refund_method,
      reason: line.reason,
      bank_confirmed_at: line.bank_confirmed_at,
    }),
    createdAt: toIsoDatetime(midtransWib(line.created_at)),
    updatedAt: toIsoDatetime(midtransWib(line.bank_confirmed_at ?? line.created_at)),
    raw: line,
  }
}
