/**
 * Triple-A payment -> canonical Charge.
 *
 * Source shape: `PaymentDetailsWithNoTxs` (items of GET /payments) and
 * `PaymentDetails` (GET /payment/{payment_reference}) in the vendor's
 * Crypto-Payments.yaml. Both are `Payment` (= `PaymentCommon01` plus status
 * fields) and `PaymentDetails02` (which includes `Payer`). Only fields named
 * there are read:
 *
 * - `payment_reference`: "Unique Payment Reference Number that identifies this payment"
 * - `order_currency`: "Currency that the merchant will receive. This should be a
 *   3-character ISO 4217 currency code"
 * - `order_amount`: "The amount of currency that the merchant wants to receive"
 * - `status`: enum none | short | hold | good | invalid
 * - `status_date`: "Date and time the `status` was updated"
 * - `payer_id`: "The merchant needs to provide a unique ID for each payer."
 *
 * The spec documents no creation timestamp for a payment, so `createdAt` is
 * left unset rather than guessed.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'

export type TripleAPaymentStatus = 'none' | 'short' | 'hold' | 'good' | 'invalid'

export interface RawTripleAPayment {
  type?: string
  payment_reference?: string
  crypto_currency?: string
  crypto_address?: string
  crypto_amount?: number
  order_currency?: string
  order_amount?: number
  exchange_rate?: number
  status?: TripleAPaymentStatus | string
  status_date?: string
  receive_amount?: number
  payment_tier?: string
  payment_tier_date?: string
  payment_currency?: string
  payment_amount?: number
  payment_crypto_amount?: number
  refundable?: boolean
  payer_id?: string
  payer_name?: string
  payer_email?: string
  [key: string]: unknown
}

/**
 * `status` per the spec: `none` "no payment has been detected (yet)", `short`
 * "short of the requested amount", `hold` "cannot be instantly confirmed" —
 * all three "The merchant **should not** deliver the goods and services";
 * `good` "you can now deliver the goods and services ... Your funds are now
 * guaranteed"; `invalid` "the payment was unable to be processed".
 */
const STATUS: Record<TripleAPaymentStatus, ChargeStatus> = {
  none: 'pending',
  short: 'pending',
  hold: 'pending',
  good: 'succeeded',
  invalid: 'failed',
}

function mapStatus(s: unknown): ChargeStatus {
  return typeof s === 'string' && s in STATUS ? STATUS[s as TripleAPaymentStatus] : 'unknown'
}

export function transformCharge(raw: RawTripleAPayment): Charge {
  const ref = raw.payment_reference
  if (typeof ref !== 'string' || !ref) {
    throw new Error('Triple-A payment carried no payment_reference.')
  }
  if (typeof raw.order_currency !== 'string' || !raw.order_currency) {
    throw new Error(`Triple-A payment ${ref} carried no order_currency.`)
  }
  const currency = raw.order_currency.toUpperCase()
  const amount = majorToMinor(
    typeof raw.order_amount === 'number' ? raw.order_amount : undefined,
    currency,
  )
  if (amount === undefined) {
    throw new Error(`Triple-A payment ${ref} carried no order_amount.`)
  }

  const metadata: Record<string, string> = {}
  if (typeof raw.type === 'string') metadata.type = raw.type
  if (typeof raw.crypto_currency === 'string') metadata.crypto_currency = raw.crypto_currency
  if (typeof raw.crypto_amount === 'number') metadata.crypto_amount = String(raw.crypto_amount)
  if (typeof raw.crypto_address === 'string') metadata.crypto_address = raw.crypto_address

  return {
    id: ref,
    externalId: ref,
    amount,
    currency,
    status: mapStatus(raw.status),
    customerId: typeof raw.payer_id === 'string' && raw.payer_id ? raw.payer_id : undefined,
    gateway: 'triple-a',
    metadata,
    updatedAt: typeof raw.status_date === 'string' && raw.status_date ? raw.status_date : undefined,
    raw,
  }
}
