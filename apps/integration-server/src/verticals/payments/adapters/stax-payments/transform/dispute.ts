import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Dispute, DisputeReason } from '../../../schema/dispute'
import { majorNumber, optStr, requiredId } from './shared'

/**
 * A Stax dispute, as GET /underwriting/disputes lists it. Fields from the
 * documented response example: id, transaction_id, merchant_id, reason,
 * amount, status, respond_by, created_at, updated_at.
 * https://docs.staxpayments.com/reference/list-disputes
 */
export interface RawStaxDispute {
  id?: string
  transaction_id?: string | null
  reason?: string | null
  amount?: number | null
  status?: string | null
  respond_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/** `FRAUD` is the only reason value the docs show. */
function mapReason(r: unknown): DisputeReason | undefined {
  if (r === 'FRAUD') return 'fraudulent'
  return undefined
}

/**
 * Disputes carry no currency field; `currency` is the merchant's, from
 * GET /self (see `index.ts`). The docs show statuses (PENDING,
 * EVIDENCE_UPLOADED) but define none, so the status is not mapped.
 */
export function transformDispute(raw: RawStaxDispute, currency: string): Dispute {
  const id = requiredId(raw.id, 'dispute')
  const chargeId = optStr(raw.transaction_id)
  if (chargeId === undefined) throw new Error(`Stax Payments dispute ${id} has no transaction_id`)
  const amount = majorNumber(raw.amount)
  if (amount === undefined) throw new Error(`Stax Payments dispute ${id} has no amount`)
  return {
    id,
    externalId: id,
    chargeId,
    amount: majorToMinor(amount, currency),
    currency,
    status: 'unknown',
    reason: mapReason(raw.reason),
    evidenceDueBy: toIsoDatetime(raw.respond_by),
    gateway: 'stax-payments',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
