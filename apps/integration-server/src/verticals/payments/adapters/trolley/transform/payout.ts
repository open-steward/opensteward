/**
 * Trolley Payment → canonical Payout.
 *
 * A Trolley payment is an outgoing transfer to a recipient, inside a batch.
 * Fields read are the documented Payment object's ("Retrieve a payment" and
 * "List all Payments in Batch" example responses,
 * https://developers.trolley.com/api/):
 *
 *   - `sourceAmount` / `sourceCurrency`: the amount sent, in the merchant's
 *     currency ("Amount you wish to send, e.g. 100.00 USD, in your own
 *     currency."), a decimal string;
 *   - `targetAmount` / `targetCurrency`: what the recipient receives, kept in
 *     metadata;
 *   - `status`: one of the documented Payment Statuses `pending`, `failed`,
 *     `processed`, `returned`, `processing`;
 *   - `memo`: "This memo will be displayed on the recipient's bank statement
 *     descriptor";
 *   - `createdAt`, `updatedAt`, `recipient.id`, `batch.id`.
 *
 * `estimatedDeliveryAt` and `failureMessage` are not read: openapi.yml types
 * both only as `type: 'null'`, so their non-null format is undocumented.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'

export interface RawTrolleyPayout {
  id?: string | null
  status?: string | null
  sourceAmount?: string | null
  sourceCurrency?: string | null
  targetAmount?: string | null
  targetCurrency?: string | null
  memo?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  recipient?: { id?: string | null; [k: string]: unknown } | null
  batch?: { id?: string | null; [k: string]: unknown } | null
  [k: string]: unknown
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** Documented Payment Statuses (developers.trolley.com/api, "Payment Status"). */
function mapStatus(s: string | null | undefined): PayoutStatus {
  switch (s) {
    case 'pending':
      return 'pending'
    case 'processing':
      return 'in_transit'
    case 'processed':
      return 'paid'
    case 'failed':
    case 'returned':
      return 'failed'
    default:
      return 'unknown'
  }
}

export function transformPayout(raw: RawTrolleyPayout): Payout {
  const id = text(raw.id)
  if (!id) throw new Error('Trolley payment has no id')
  const currency = text(raw.sourceCurrency)
  const value = text(raw.sourceAmount)
  const amount = value === undefined ? undefined : majorToMinor(Number(value), currency)
  if (!currency || amount === undefined) {
    throw new Error(`Trolley payment ${id} has no sourceAmount/sourceCurrency`)
  }
  const metadata: Record<string, string> = {}
  const recipientId = text(raw.recipient?.id)
  const batchId = text(raw.batch?.id)
  const targetAmount = text(raw.targetAmount)
  const targetCurrency = text(raw.targetCurrency)
  if (recipientId) metadata['recipientId'] = recipientId
  if (batchId) metadata['batchId'] = batchId
  if (targetAmount) metadata['targetAmount'] = targetAmount
  if (targetCurrency) metadata['targetCurrency'] = targetCurrency
  return {
    id,
    externalId: id,
    amount,
    currency: currency.toUpperCase(),
    status: mapStatus(raw.status),
    statementDescriptor: text(raw.memo),
    gateway: 'trolley',
    metadata,
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
    raw,
  }
}
