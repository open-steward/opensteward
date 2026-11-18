/**
 * Fawry's refund endpoint returns only an outcome envelope — `type`,
 * `statusCode`, `statusDescription` — with no standalone refund object to list
 * or fetch afterward. So the only refund transform is response → canonical, and
 * the request-side values the response omits (the originating charge reference,
 * the refunded amount in minor units, the currency, the reason) ride in via a
 * `hint`.
 *
 * A `statusCode` of `200` means the refund was accepted by Fawry.
 *
 * Ref: https://developer.fawrystaging.com/docs/server-apis/refund-issue-api
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap } from './shared'

export interface RawFawryRefundResponse {
  type?: string
  statusCode?: number | string
  statusDescription?: string
  [k: string]: unknown
}

/** Request-side values the refund response does not echo back. */
export interface RefundHint {
  chargeId?: string
  amount?: number
  currency?: string
  reason?: string
}

function mapStatus(raw: RawFawryRefundResponse): RefundStatus {
  return String(raw.statusCode ?? '') === '200' ? 'succeeded' : 'failed'
}

export function transformRefund(raw: RawFawryRefundResponse, hint: RefundHint = {}): Refund {
  return {
    id: String(hint.chargeId ?? ''),
    externalId: String(hint.chargeId ?? ''),
    chargeId: String(hint.chargeId ?? ''),
    amount: hint.amount ?? 0,
    currency: pickCurrency(hint.currency),
    status: mapStatus(raw),
    failureReason:
      String(raw.statusCode ?? '') === '200' ? undefined : raw.statusDescription,
    gateway: 'fawry',
    metadata: strMap({
      reason: hint.reason,
      statusCode: raw.statusCode,
      statusDescription: raw.statusDescription,
    }),
    raw,
  }
}
