/**
 * Triple-A payout -> canonical Payout.
 *
 * Source shape: `PayoutCrypto` (items of GET /payouts) and `PayoutResp`
 * (GET /payout/withdraw/{payout_reference}, = `PayoutCrypto` + `NotifyBase`)
 * in the vendor's Crypto-Payouts.yaml. Only fields named there are read:
 *
 * - `payout_reference`: "Unique payout reference number"
 * - `local_currency`: "The local currency equivalent of the payout. This should
 *   be a 3-character ISO 4217 currency code."
 * - `local_amount`: "The local currency amount to be paid out."
 * - `status`: enum new | confirm | done | cancel
 * - `status_date`: "Date and time the status was updated"
 * - `type`: enum refund | withdraw; `remarks`: "Remarks for the payout"
 *
 * The spec documents no creation timestamp for a payout, so `createdAt` is
 * left unset rather than guessed.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'

export type TripleAPayoutStatus = 'new' | 'confirm' | 'done' | 'cancel'

export interface RawTripleAPayout {
  payout_reference?: string
  order_id?: string
  type?: 'refund' | 'withdraw' | string
  account_type?: string
  convert_type?: string
  payout_destination_type?: string
  local_currency?: string
  local_amount?: number
  crypto_currency?: string
  crypto_amount?: number
  network_fee_crypto_amount?: number
  network_fee_fiat_amt?: number
  net_crypto_amount?: number
  crypto_address?: string
  exchange_rate?: number
  status?: TripleAPayoutStatus | string
  status_date?: string
  merchant_name?: string
  remarks?: string
  [key: string]: unknown
}

/**
 * `status` per the spec: `new` "has just been created, but the recipient has
 * not entered in their receiving crypto address"; `confirm` "The recipient has
 * confirmed their receiving crypto address and the exchange rate has been
 * fixed"; `done` "broadcasted to the blockchain and successfully paid out to
 * the recipient"; `cancel` "The crypto payout has been cancelled".
 */
const STATUS: Record<TripleAPayoutStatus, PayoutStatus> = {
  new: 'pending',
  confirm: 'pending',
  done: 'paid',
  cancel: 'cancelled',
}

function mapStatus(s: unknown): PayoutStatus {
  return typeof s === 'string' && s in STATUS ? STATUS[s as TripleAPayoutStatus] : 'unknown'
}

export function transformPayout(raw: RawTripleAPayout): Payout {
  const ref = raw.payout_reference
  if (typeof ref !== 'string' || !ref) {
    throw new Error('Triple-A payout carried no payout_reference.')
  }
  if (typeof raw.local_currency !== 'string' || !raw.local_currency) {
    throw new Error(`Triple-A payout ${ref} carried no local_currency.`)
  }
  const currency = raw.local_currency.toUpperCase()
  const amount = majorToMinor(
    typeof raw.local_amount === 'number' ? raw.local_amount : undefined,
    currency,
  )
  if (amount === undefined) {
    throw new Error(`Triple-A payout ${ref} carried no local_amount.`)
  }

  const metadata: Record<string, string> = {}
  if (typeof raw.type === 'string') metadata.type = raw.type
  if (typeof raw.order_id === 'string') metadata.order_id = raw.order_id
  if (typeof raw.crypto_currency === 'string') metadata.crypto_currency = raw.crypto_currency
  if (typeof raw.crypto_amount === 'number') metadata.crypto_amount = String(raw.crypto_amount)
  if (typeof raw.remarks === 'string') metadata.remarks = raw.remarks

  return {
    id: ref,
    externalId: ref,
    amount,
    currency,
    status: mapStatus(raw.status),
    gateway: 'triple-a',
    metadata,
    updatedAt: typeof raw.status_date === 'string' && raw.status_date ? raw.status_date : undefined,
    raw,
  }
}
