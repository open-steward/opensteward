/**
 * GP-API transaction (type SALE) -> canonical Charge.
 *
 * Fields are those of the `transactions[]` items of GET /transactions and of
 * the GET /transactions/{id} response
 * (https://developer.globalpayments.com/api/transactions):
 *
 * - amount: "The amount to transfer between Payer and Merchant for a SALE or
 *   a REFUND. It is always represented in the lowest denomination of the
 *   related currency. and with no decimal point." (a string, e.g. "11099")
 * - currency: "The currency of the amount in ISO-4217(alpha-3)."
 * - time_created: "Time indicating when the transaction was created in
 *   ISO-8601 format."
 * - time_last_updated (single view only): "Time indicating when the object
 *   was last updated in ISO-8601 format."
 * - description (single view): "Merchant defined description for the
 *   transaction."
 * - status: FOR_REVIEW, INITIATED, PENDING, PREAUTHORIZED, CAPTURED,
 *   REVERSED, DECLINED, FUNDED, FAILED, REJECTED (mapped below).
 */

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from './shared'

export interface RawGlobalPaymentsTransaction {
  id: string
  time_created?: string
  time_last_updated?: string
  status?: string
  type?: string
  channel?: string
  amount?: string
  currency?: string
  reference?: string
  description?: string
  account_id?: string
  account_name?: string
  batch_id?: string
  [key: string]: unknown
}

/**
 * Status descriptions quoted from the `status` enum:
 * - "`PREAUTHORIZED` - A Transaction has been approved but a capture request
 *   is required to commence the movement of funds."
 * - "`CAPTURED` - A Transaction has been successfully authorized and captured."
 * - "`FUNDED` - A Transaction where the funds have transferred between payer
 *   and merchant as expected."
 * - "`REVERSED` - ... voids/cancels a transaction before it is funded."
 * - "`DECLINED`", "`FAILED`", "`REJECTED`" - the transfer did not happen.
 */
const STATUS: Record<string, ChargeStatus> = {
  FOR_REVIEW: 'pending',
  INITIATED: 'pending',
  PENDING: 'pending',
  PREAUTHORIZED: 'pending',
  CAPTURED: 'succeeded',
  FUNDED: 'succeeded',
  REVERSED: 'cancelled',
  DECLINED: 'failed',
  FAILED: 'failed',
  REJECTED: 'failed',
}

const CAPTURED: Record<string, boolean> = {
  PREAUTHORIZED: false,
  CAPTURED: true,
  FUNDED: true,
}

/** A GP-API minor-unit amount string ("11099") as an integer, or throw. */
export function minorUnits(value: unknown, what: string): number {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new Error(`Global Payments ${what} has no integer amount: ${JSON.stringify(value)}`)
  }
  return Number(value)
}

export function currencyOf(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value)) {
    throw new Error(`Global Payments ${what} has no ISO-4217 currency: ${JSON.stringify(value)}`)
  }
  return value.toUpperCase()
}

function nonEmpty(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function transformCharge(raw: RawGlobalPaymentsTransaction): Charge {
  const what = `transaction ${raw.id}`
  const status = typeof raw.status === 'string' ? raw.status : ''
  const metadata: Record<string, string> = {}
  for (const key of [
    'type',
    'channel',
    'reference',
    'account_id',
    'account_name',
    'batch_id',
  ] as const) {
    const v = nonEmpty(raw[key])
    if (v !== undefined) metadata[key] = v
  }
  const captured = CAPTURED[status]
  return {
    id: raw.id,
    externalId: raw.id,
    amount: minorUnits(raw.amount, what),
    currency: currencyOf(raw.currency, what),
    status: STATUS[status] ?? 'unknown',
    ...(captured !== undefined ? { captured } : {}),
    description: nonEmpty(raw.description),
    gateway: 'global-payments',
    metadata,
    createdAt: toIsoDatetime(raw.time_created),
    updatedAt: toIsoDatetime(raw.time_last_updated),
    raw,
  }
}
