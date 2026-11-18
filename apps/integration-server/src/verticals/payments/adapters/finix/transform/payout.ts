/**
 * Finix `Settlement` ↔ canonical `Payout`.
 *
 * In Finix, a settlement is the aggregate net payout disbursed to a merchant's
 * bank account. Settlements live at `GET /settlements` and
 * `GET /settlements/{id}`. `status` is STAGED / SUCCEEDED / FAILED.
 * Amounts are integer minor units; `currency` is ISO 4217 (usually USD).
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { iso, pickCurrency, refId, strMap } from './shared'

export interface RawFinixSettlement {
  id?: string
  status?: string | null
  total_amount?: number | null
  total_fee?: number | null
  total_reversals?: number | null
  net_amount?: number | null
  currency?: string | null
  destination?: string | null
  merchant?: string | null
  identity?: string | null
  funds_flow?: string | null
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawFinixSettlement): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'paid'
    case 'STAGED':
      return 'in_transit'
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawFinixSettlement): Payout {
  const amount = raw.net_amount ?? raw.total_amount ?? 0
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      total_fee: raw.total_fee,
      total_reversals: raw.total_reversals,
      destination: refId(raw.destination),
      merchant: refId(raw.merchant),
      identity: refId(raw.identity),
      funds_flow: raw.funds_flow,
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
