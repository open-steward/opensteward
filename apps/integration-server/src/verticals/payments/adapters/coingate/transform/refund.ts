/**
 * CoinGate refunds are created against an order (`POST /orders/{id}/refunds`)
 * and listed account-wide (`GET /refunds`). A refund carries
 * `request_amount` (what the merchant asked to refund, in the order's price
 * currency) and `refund_amount` (the actual crypto amount sent). We
 * canonicalise on `refund_amount` when present (the realised value), else
 * `request_amount`, and surface the order linkage via `chargeId`.
 *
 * Amounts are decimal strings → integer minor units (see toMinorUnits);
 * the originals are preserved on `metadata`.
 *
 * Refund statuses: pending, processing, rejected, completed.
 *
 * Refs:
 *   https://developer.coingate.com/reference/create-refund
 *   https://developer.coingate.com/reference/get-refunds
 *   https://developer.coingate.com/reference/refund-statuses
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawCoingateRefundOrder {
  id?: number | string
  title?: string
  price_amount?: string
  price_currency?: string
  created_at?: string
  [k: string]: unknown
}

export interface RawCoingateRefundCurrency {
  id?: number
  title?: string
  symbol?: string
  platform?: { id?: number; title?: string } & Record<string, unknown>
  [k: string]: unknown
}

export interface RawCoingateRefund {
  id?: number | string
  request_amount?: string
  refund_amount?: string
  address?: string
  memo?: string
  status?: string
  processor?: string
  rejection_type?: string
  rejection_reason?: string
  order?: RawCoingateRefundOrder
  refund_currency?: RawCoingateRefundCurrency
  ledger_account?: { id?: number; currency?: Record<string, unknown> } & Record<string, unknown>
  transactions?: unknown[]
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawCoingateRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'completed':
      return 'succeeded'
    case 'rejected':
      return 'failed'
    case 'pending':
    case 'processing':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawCoingateRefund): Refund {
  const amountStr = raw.refund_amount ?? raw.request_amount
  const currency =
    raw.refund_currency?.symbol ?? raw.order?.price_currency ?? undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.order?.id ?? ''),
    amount: toMinorUnits(amountStr),
    currency: pickCurrency(currency),
    status: mapStatus(raw),
    failureReason: raw.rejection_reason ?? undefined,
    gateway: 'coingate',
    metadata: strMap({
      request_amount: raw.request_amount,
      refund_amount: raw.refund_amount,
      address: raw.address,
      memo: raw.memo,
      processor: raw.processor,
      rejection_type: raw.rejection_type,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.created_at),
    raw,
  }
}
