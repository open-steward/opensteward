import type { Payout, PayoutStatus } from '../../../schema/payout'
import { orderSideMoney, strMap } from './shared'
import type { RawTransfiOrder } from './charge'

export type RawTransfiPayout = RawTransfiOrder

/**
 * Payout statuses from https://docs.transfi.com/docs/payouts.md ("initiated
 * | Payout accepted", "fund_processing | Sent to the bank network",
 * "fund_settled | Done. Recipient has the money", "fund_failed | Couldn't be
 * paid") and https://docs.transfi.com/docs/webhook-events-payouts.md
 * (`fund_scheduled`; crypto payouts `asset_deposited`, `fund_deposit_failed`).
 */
function mapPayoutStatus(s: string | undefined): PayoutStatus {
  switch (s) {
    case 'initiated':
      return 'pending'
    case 'fund_scheduled':
    case 'fund_processing':
      return 'in_transit'
    case 'fund_settled':
    case 'asset_deposited':
      return 'paid'
    case 'fund_failed':
    case 'fund_deposit_failed':
      return 'failed'
    default:
      return 'unknown'
  }
}

/**
 * "Put the amount in `destination` so the recipient gets exactly that."
 * (https://docs.transfi.com/docs/payouts.md) — the payout amount is
 * `destination.amount` in `destination.currency`.
 */
export function transformPayout(raw: RawTransfiPayout): Payout {
  const id = raw.id
  if (!id) throw new Error('TransFi order has no id')
  const { amount, currency } = orderSideMoney(id, 'destination', raw.destination)
  return {
    id,
    externalId: id,
    amount,
    currency,
    status: mapPayoutStatus(raw.status),
    ...(raw.failureCode ? { failureCode: raw.failureCode } : {}),
    ...(raw.failureMessage ? { failureMessage: raw.failureMessage } : {}),
    gateway: 'transfi',
    metadata: strMap(raw.partnerContext),
    ...(raw.createdAt ? { createdAt: raw.createdAt } : {}),
    ...(raw.updatedAt ? { updatedAt: raw.updatedAt } : {}),
    raw,
  }
}
