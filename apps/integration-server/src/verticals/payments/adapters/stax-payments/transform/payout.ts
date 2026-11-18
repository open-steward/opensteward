import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Payout } from '../../../schema/payout'
import { majorNumber, requiredId } from './shared'

/**
 * A Stax deposit (settlement batch), as GET /query/deposit lists it. Fields
 * from the documented response example: batched_at, batch_id,
 * last_transaction, count, sum, avg, min, max, std.
 * https://docs.staxpayments.com/reference/get-list-of-deposits
 */
export interface RawStaxDeposit {
  batch_id?: string
  batched_at?: string | null
  sum?: number | null
  [k: string]: unknown
}

/**
 * Deposits carry no currency and no status field. `currency` is the
 * merchant's, from GET /self (see `index.ts`); the status is not claimed.
 * `batched_at` is the batch date, not the date funds arrive, so it is the
 * creation time and `arrivalDate` stays empty.
 */
export function transformPayout(raw: RawStaxDeposit, currency: string): Payout {
  const id = requiredId(raw.batch_id, 'deposit batch')
  const sum = majorNumber(raw.sum)
  if (sum === undefined) throw new Error(`Stax Payments deposit ${id} has no sum`)
  return {
    id,
    externalId: id,
    amount: majorToMinor(sum, currency),
    currency,
    status: 'unknown',
    gateway: 'stax-payments',
    metadata: {},
    createdAt: toIsoDatetime(raw.batched_at),
    raw,
  }
}
