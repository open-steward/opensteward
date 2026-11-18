/**
 * Instamojo payout (MDP v2) -> canonical Payout.
 *
 * Fields: the example row of List Payouts,
 * https://docs.instamojo.com/v2-mdp/reference/payouts. The page describes
 * its time filters as "paid out date-time", read here as `paid_out_at`. The
 * boolean `status` has no documented meaning for payouts, so it maps to
 * `unknown` rather than a guessed state.
 *
 * `paid_amount` is a major-unit decimal string ("1570.75" INR).
 */

import { majorToMinor } from '@opensteward/shared'
import type { Payout } from '../../../schema/payout'
import { toIsoDatetime } from './shared'

export interface RawInstamojoPayout {
  id: string
  recipient?: string | null
  status?: boolean | null
  paid_out_at?: string | null
  currency: string
  paid_amount: string
  sales_amount?: string | null
  fee_amount?: string | null
  total_tax_amount?: string | null
  held_amount?: string | null
  reversed_amount?: string | null
  refunded_amount?: string | null
  affiliate_commission_amount?: string | null
  partner_commission_amount?: string | null
  payout_type?: number | null
  resource_uri?: string | null
  shipping_fee?: string | null
}

export function transformPayout(raw: RawInstamojoPayout): Payout {
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throw new Error(`Instamojo payout ${raw.id} has no currency`)
  }
  const major =
    typeof raw.paid_amount === 'string' && raw.paid_amount !== '' ? Number(raw.paid_amount) : NaN
  const amount = majorToMinor(major, raw.currency)
  if (amount === undefined) {
    throw new Error(`Instamojo payout ${raw.id} has no numeric paid_amount`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    amount,
    currency: raw.currency.toUpperCase(),
    status: 'unknown',
    arrivalDate: toIsoDatetime(raw.paid_out_at),
    gateway: 'instamojo',
    metadata: {},
    raw,
  }
}
