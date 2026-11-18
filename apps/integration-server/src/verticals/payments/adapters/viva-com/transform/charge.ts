/**
 * Viva.com Data Services transaction → canonical Charge.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from './shared'
import { currencyOf, type RawVivaComTransaction } from './transaction'

/**
 * StatusId, per the spec: "F – … (PAYMENT SUCCESSFUL)", "E – … (PAYMENT
 * UNSUCCESSFUL)", "A – … (PAYMENT PENDING)", "R – … fully or partially
 * refunded", "X – … cancelled by the merchant", "M…" – dispute states.
 * R cannot tell full from partial, so it stays unknown.
 */
const STATUS: Record<string, ChargeStatus> = {
  F: 'succeeded',
  E: 'failed',
  A: 'pending',
  X: 'cancelled',
  M: 'disputed',
  MA: 'disputed',
  MI: 'disputed',
  ML: 'disputed',
  MW: 'disputed',
  MS: 'disputed',
}

export function transformCharge(raw: RawVivaComTransaction): Charge {
  const currency = currencyOf(raw)
  const amount = majorToMinor(raw.Amount, currency)
  if (amount === undefined) {
    throw new Error(`Viva.com transaction ${raw.TransactionId} has no Amount`)
  }
  const metadata: Record<string, string> = {}
  if (typeof raw.OrderCode === 'number') metadata.orderCode = String(raw.OrderCode)
  if (raw.MerchantTrns) metadata.merchantTrns = raw.MerchantTrns
  return {
    id: raw.TransactionId,
    externalId: raw.TransactionId,
    amount,
    currency,
    status: (raw.StatusId && STATUS[raw.StatusId]) || 'unknown',
    description: raw.CustomerTrns || undefined,
    receiptEmail: raw.Email || undefined,
    gateway: 'viva-com',
    metadata,
    createdAt: toIsoDatetime(raw.InsDate),
    raw,
  }
}
