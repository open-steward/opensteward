/**
 * Afterpay `Dispute` → canonical `Dispute`.
 *
 * Endpoints:
 *   GET /v2/disputes           — list
 *   GET /v2/disputes/{id}      — get
 *
 * Reference: https://developers.afterpay.com/afterpay-online-developer/api-reference/reference/disputes
 */
import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawAfterpayDispute {
  id?: string
  order?: string
  amount?: string
  currency?: string
  reason?: string
  status?: string
  open?: boolean
  responseDueBy?: string | number
  createdAt?: string
  updatedAt?: string
  merchantOrderId?: string
  openingNote?: string
  closingReason?: string
  closingNote?: string
  transactionDate?: string
  settlementAmount?: string
  meta?: { amount?: string; network?: string; orderType?: string }
  [k: string]: unknown
}

function mapStatus(raw: RawAfterpayDispute): DisputeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'needs_response':
      return 'needs_response'
    case 'under_review':
      return 'under_review'
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    case 'merchant_refunded':
      return 'charge_refunded'
    case 'merchant_voided':
      return 'warning_closed'
    default:
      return 'under_review'
  }
}

function mapReason(v: string | undefined): DisputeReason | undefined {
  if (!v) return undefined
  switch (v.toLowerCase()) {
    case 'product_not_received':
      return 'product_not_received'
    case 'fraudulent':
      return 'fraudulent'
    case 'duplicate':
      return 'duplicate'
    case 'product_unacceptable':
      return 'product_unacceptable'
    case 'credit_not_processed':
      return 'credit_not_processed'
    case 'subscription_cancelled':
      return 'subscription_cancelled'
    case 'unrecognized':
      return 'unrecognized'
    case 'general':
      return 'general'
    default:
      return 'other'
  }
}

/** Afterpay returns responseDueBy as an epoch-ms number or ISO string */
function toIso(v: string | number | undefined): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return new Date(v).toISOString()
  return v
}

export function transformDispute(raw: RawAfterpayDispute): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.order ?? raw.merchantOrderId ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency ?? raw.meta?.amount?.split(' ')?.[1]),
    status: mapStatus(raw),
    reason: mapReason(raw.reason),
    evidenceDueBy: toIso(raw.responseDueBy),
    network: raw.meta?.network,
    gateway: 'afterpay',
    metadata: strMap({
      merchant_order_id: raw.merchantOrderId,
      closing_reason: raw.closingReason,
    }),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  }
}
