/**
 * Instamojo payment (MDP v2) -> canonical Charge.
 *
 * Fields: the example row of List Payments,
 * https://docs.instamojo.com/v2-mdp/reference/payments. Status and failure:
 * Get Payment Details, https://docs.instamojo.com/reference/get-payment-details-1:
 *   status: "* **true** => Successful\n* **false** => Failed\n* **null** => Initiated"
 *   failure: "reason => Type of failure.\nmessage => Failure message returned by upstream provider."
 *
 * `amount` is a major-unit decimal string ("9494.00" INR).
 */

import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime, pickStr } from './shared'

export interface RawInstamojoPayment {
  id: string
  title?: string | null
  payment_type?: string | null
  status: boolean | null
  link?: string | null
  product?: string | null
  seller?: string | null
  currency: string
  amount: string
  name?: string | null
  email?: string | null
  phone?: string | null
  payout?: string | null
  fees?: string | null
  total_taxes?: string | null
  cases?: unknown[]
  instrument_type?: string | null
  billing_instrument?: string | null
  failure?: { reason?: string | null; message?: string | null } | null
  created_at?: string | null
  updated_at?: string | null
  tax_invoice_id?: string | null
  resource_uri?: string | null
}

function chargeStatus(status: unknown): ChargeStatus {
  if (status === true) return 'succeeded'
  if (status === false) return 'failed'
  if (status === null) return 'pending'
  return 'unknown'
}

export function transformCharge(raw: RawInstamojoPayment): Charge {
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throw new Error(`Instamojo payment ${raw.id} has no currency`)
  }
  const major = typeof raw.amount === 'string' && raw.amount !== '' ? Number(raw.amount) : NaN
  const amount = majorToMinor(major, raw.currency)
  if (amount === undefined) {
    throw new Error(`Instamojo payment ${raw.id} has no numeric amount`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    amount,
    currency: raw.currency.toUpperCase(),
    status: chargeStatus(raw.status),
    description: pickStr(raw.title),
    failureCode: pickStr(raw.failure?.reason),
    failureMessage: pickStr(raw.failure?.message),
    gateway: 'instamojo',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
