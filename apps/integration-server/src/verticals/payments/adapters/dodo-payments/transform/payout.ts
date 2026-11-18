/**
 * Dodo Payments `Payout` → canonical `Payout`.
 *
 * Dodo payout status values:
 *   not_initiated, in_progress, on_hold, failed, success
 *
 * Amounts are integer minor units (int64). `payment_method` is a string
 * descriptor of the bank/transfer channel, not a PM id.
 *
 * Docs: https://docs.dodopayments.com/api-reference/payouts/get-payouts
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap } from './shared'

export interface RawDodoPayout {
  payout_id?: string
  business_id?: string
  payment_method?: string | null
  status?: string
  amount?: number
  fee?: number
  tax?: number
  currency?: string
  created_at?: string
  updated_at?: string
  refunds?: number
  chargebacks?: number
  name?: string | null
  remarks?: string | null
  payout_document_url?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawDodoPayout): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
      return 'paid'
    case 'in_progress':
      return 'in_transit'
    case 'not_initiated':
    case 'on_hold':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawDodoPayout): Payout {
  return {
    id: String(raw.payout_id ?? ''),
    externalId: String(raw.payout_id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    method: 'standard',
    arrivalDate: undefined,
    destinationLast4: undefined,
    statementDescriptor: raw.name ?? undefined,
    failureCode: undefined,
    failureMessage: raw.remarks ?? undefined,
    gateway: 'dodo-payments',
    metadata: strMap({
      business_id: raw.business_id,
      payment_method: raw.payment_method,
      fee: raw.fee,
      payout_document_url: raw.payout_document_url,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.created_at),
    raw,
  }
}
