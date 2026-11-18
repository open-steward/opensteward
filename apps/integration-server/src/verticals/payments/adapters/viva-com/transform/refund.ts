/**
 * Viva.com Data Services refund transaction → canonical Refund.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from './shared'
import { currencyOf, type RawVivaComTransaction } from './transaction'

/** StatusId: "F – … completed successfully", "E – … error", "A – … in progress", "X – … cancelled by the merchant". */
const STATUS: Record<string, RefundStatus> = {
  F: 'succeeded',
  E: 'failed',
  A: 'pending',
  X: 'cancelled',
}

export function transformRefund(raw: RawVivaComTransaction): Refund {
  if (!raw.ParentId) {
    throw new Error(
      `Viva.com refund ${raw.TransactionId} has no ParentId (originating transaction)`,
    )
  }
  const currency = currencyOf(raw)
  // "Transactions which reverse previous payments will always have a negative amount."
  const signed = majorToMinor(raw.Amount, currency)
  if (signed === undefined) {
    throw new Error(`Viva.com refund ${raw.TransactionId} has no Amount`)
  }
  const metadata: Record<string, string> = {}
  if (typeof raw.OrderCode === 'number') metadata.orderCode = String(raw.OrderCode)
  if (raw.MerchantTrns) metadata.merchantTrns = raw.MerchantTrns
  return {
    id: raw.TransactionId,
    externalId: raw.TransactionId,
    chargeId: raw.ParentId,
    amount: Math.abs(signed),
    currency,
    status: (raw.StatusId && STATUS[raw.StatusId]) || 'unknown',
    gateway: 'viva-com',
    metadata,
    createdAt: toIsoDatetime(raw.InsDate),
    raw,
  }
}
