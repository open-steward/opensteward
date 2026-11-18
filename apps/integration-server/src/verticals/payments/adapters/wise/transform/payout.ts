/**
 * Wise transfer -> canonical Payout.
 *
 * A Wise transfer is money Wise pays out to a recipient account. The fields
 * read here are those of the documented `transfer` / `originator-transfer`
 * schemas returned by GET /v1/transfers and GET /v1/transfers/{transferId}
 * (https://docs.wise.com/api-reference/legacy/standard-transfer/transferlist):
 *
 * - `id` — "Transfer ID" (integer)
 * - `status` — "Transfer current status"
 * - `targetValue` — "Transfer amount in target currency" (a major-unit number)
 * - `targetCurrency` — "Target currency code"
 * - `created` — "Timestamp when transfer was created", documented example
 *   `"2017-11-24 10:47:49"`
 * - `details.reference` — "Payment reference text"
 *
 * The payout amount is what the recipient is paid: `targetValue` in
 * `targetCurrency`.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'

export interface RawWiseTransfer {
  id: number
  status?: string
  targetValue?: number
  targetCurrency?: string
  created?: string
  details?: { reference?: string }
  [key: string]: unknown
}

/**
 * Transfer statuses from "Tracking transfers"
 * (https://docs.wise.com/guides/product/send-money/tracking-transfers).
 */
const STATUS: Record<string, PayoutStatus> = {
  // "The transfer has been submitted and Wise is waiting for the funds to arrive."
  incoming_payment_waiting: 'pending',
  // "The funding has been initiated but the money has not yet arrived to Wise's account."
  incoming_payment_initiated: 'pending',
  // "Wise has received the funds and is processing the transfer."
  processing: 'pending',
  // "funds have been converted from the source currency to the target currency."
  funds_converted: 'pending',
  // "Wise has paid out funds to the recipient. This is the final state of the transfer"
  outgoing_payment_sent: 'paid',
  // "the transfer was never funded and therefore never processed."
  cancelled: 'cancelled',
  // "a final state of a transfer that was funded and then cancelled."
  funds_refunded: 'cancelled',
  // "The transfer has bounced back but has not yet been cancelled or refunded. This status
  // means the transfer will either be delivered with delay or it will go into the
  // funds_refunded state." Not final, so not 'failed'.
  bounced_back: 'pending',
  // "Wise is unable to debit the payer's account for some reason, or the payer requested the funds back."
  charged_back: 'failed',
  // "Wise does not have enough information to move the transfer into a final state."
  unknown: 'unknown',
}

/**
 * `created` is documented as a zone-less `yyyy-MM-dd HH:mm:ss` string, and the
 * docs do not say which zone it is in. Only a value that names its own zone
 * is converted; anything else is left out rather than guessed.
 */
function zonedIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformPayout(raw: RawWiseTransfer): Payout {
  if (typeof raw.id !== 'number' && typeof raw.id !== 'string') {
    throw new Error('Wise transfer has no id')
  }
  if (typeof raw.targetValue !== 'number' || typeof raw.targetCurrency !== 'string') {
    throw new Error(`Wise transfer ${raw.id} has no targetValue/targetCurrency`)
  }
  const id = String(raw.id)
  const currency = raw.targetCurrency.toUpperCase()
  const reference = raw.details?.reference
  const createdAt = zonedIso(raw.created)
  return {
    id,
    externalId: id,
    amount: majorToMinor(raw.targetValue, currency),
    currency,
    status: (typeof raw.status === 'string' && STATUS[raw.status]) || 'unknown',
    ...(typeof reference === 'string' && reference !== ''
      ? { statementDescriptor: reference }
      : {}),
    gateway: 'wise',
    metadata: {},
    ...(createdAt ? { createdAt } : {}),
    raw,
  }
}
