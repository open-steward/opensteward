/**
 * Rebilly transaction (type sale / authorize / capture) → canonical Charge.
 *
 * Fields from components/schemas/Transaction.yaml
 * (https://github.com/Rebilly/api-definitions). `status` enum: completed,
 * conn-error, disputed, never-sent, offsite, partially-refunded, pending,
 * refunded, sending, timeout, voided, waiting-approval, waiting-capture,
 * waiting-gateway, waiting-refund. `result` enum: abandoned, approved,
 * canceled, declined, unknown.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { requireId, requireMoney, str, strMap } from './shared'

export interface RawRebillyTransaction {
  id?: string
  customerId?: string | null
  type?: string
  status?: string
  result?: string
  amount?: number
  currency?: string
  parentTransactionId?: string | null
  description?: string
  billingDescriptor?: string | null
  customFields?: Record<string, unknown>
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

const PENDING = new Set([
  'pending',
  'sending',
  'offsite',
  'waiting-approval',
  'waiting-capture',
  'waiting-gateway',
  'waiting-refund',
])

function mapStatus(status: string | undefined, result: string | undefined): ChargeStatus {
  if (result === 'declined') return 'failed'
  if (result === 'canceled' || result === 'abandoned') return 'cancelled'
  switch (status) {
    case 'completed':
      return result === 'approved' ? 'succeeded' : 'unknown'
    case 'refunded':
      return 'refunded'
    case 'partially-refunded':
      return 'partially_refunded'
    case 'disputed':
      return 'disputed'
    case 'voided':
      return 'cancelled'
    default:
      return status !== undefined && PENDING.has(status) ? 'pending' : 'unknown'
  }
}

export function transformCharge(raw: RawRebillyTransaction): Charge {
  const id = requireId(raw.id, 'transaction id')
  const money = requireMoney(raw.amount, raw.currency, `transaction ${id}`)
  const descriptor = str(raw.billingDescriptor)
  return {
    id,
    externalId: id,
    amount: money.amount,
    currency: money.currency,
    status: mapStatus(raw.status, raw.result),
    captured:
      raw.type === 'authorize'
        ? false
        : raw.type === 'sale' || raw.type === 'capture'
          ? true
          : undefined,
    customerId: str(raw.customerId),
    description: str(raw.description),
    statementDescriptor:
      descriptor !== undefined && descriptor.length <= 64 ? descriptor : undefined,
    gateway: 'rebilly',
    metadata: strMap(raw.customFields),
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
