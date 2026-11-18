/**
 * Sezzle settlement payouts — `GET /v2/settlements/summaries`.
 *
 * Each entry in the summaries array represents one settlement payout sent to
 * the merchant's bank account. The endpoint returns up to 30 records per
 * request (pagination via `offset`). Amounts are floating-point numbers in
 * major currency units; we convert to minor units (integer cents) for the
 * canonical schema.
 *
 * Fields returned:
 *   uuid, payout_currency, payout_date, net_settlement_amount,
 *   forex_fees, status
 *
 * Docs:
 *   https://docs.sezzle.com/docs/api/reporting/settlements (v2 spec)
 *   https://docs.sezzle.com/docs/api/v1/settlement-reports/settlement-summaries-request
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

export interface RawSezzleSettlementSummary {
  uuid?: string
  payout_currency?: string
  settlement_currency?: string
  payout_date?: string
  final_payout_amount?: number
  net_settlement_amount?: number
  forex_fees?: number
  status?: string
  [k: string]: unknown
}

function toMinorUnits(major: number | null | undefined): number {
  if (major == null) return 0
  return Math.round(major * 100)
}

function mapStatus(raw: RawSezzleSettlementSummary): PayoutStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'complete' || s === 'completed' || s === 'paid') return 'paid'
  if (s === 'pending') return 'pending'
  if (s === 'in_transit' || s === 'processing') return 'in_transit'
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return 'pending'
}

export function transformPayout(raw: RawSezzleSettlementSummary): Payout {
  const currency = pickCurrency(raw.payout_currency ?? raw.settlement_currency)
  const net = toMinorUnits(raw.net_settlement_amount ?? raw.final_payout_amount)

  return {
    id: String(raw.uuid ?? ''),
    externalId: String(raw.uuid ?? ''),
    amount: net,
    currency,
    status: mapStatus(raw),
    method: 'standard',
    arrivalDate: toIsoDatetime(raw.payout_date),
    gateway: 'sezzle',
    metadata: strMap({
      forex_fees: raw.forex_fees != null ? String(raw.forex_fees) : undefined,
      settlement_currency: raw.settlement_currency,
      final_payout_amount: raw.final_payout_amount != null ? String(raw.final_payout_amount) : undefined,
    }),
    createdAt: toIsoDatetime(raw.payout_date),
    raw,
  }
}
