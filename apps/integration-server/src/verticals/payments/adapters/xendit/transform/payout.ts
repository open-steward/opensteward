import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toMinorAmount } from './shared'

/**
 * Xendit Payout object (Payouts v2 API).
 * https://docs.xendit.co/apidocs/get-payout-by-id  ·  GET /v2/payouts/{id}
 *
 * Statuses: ACCEPTED, REQUESTED, PENDING, LOCKED, CANCELLED, SUCCEEDED,
 * FAILED, REVERSED.
 */
export interface RawXenditPayout {
  id?: string
  reference_id?: string | null
  business_id?: string | null
  channel_code?: string | null
  channel_properties?: {
    account_number?: string | null
    account_holder_name?: string | null
  } | null
  amount?: number
  currency?: string
  description?: string | null
  status?:
    | 'ACCEPTED'
    | 'REQUESTED'
    | 'PENDING'
    | 'LOCKED'
    | 'CANCELLED'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'REVERSED'
    | string
  estimated_arrival_time?: string | null
  failure_code?: string | null
  metadata?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

function mapStatus(raw: RawXenditPayout): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SUCCEEDED':
      return 'paid'
    case 'ACCEPTED':
    case 'REQUESTED':
    case 'PENDING':
    case 'LOCKED':
      return 'pending'
    case 'CANCELLED':
    case 'REVERSED':
      return 'cancelled'
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

function last4(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  const digits = v.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : undefined
}

export function transformPayout(raw: RawXenditPayout): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? raw.reference_id ?? ''),
    amount: toMinorAmount(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    arrivalDate: toIsoDatetime(raw.estimated_arrival_time),
    destinationLast4: last4(raw.channel_properties?.account_number),
    failureCode: raw.failure_code ?? undefined,
    gateway: 'xendit',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      reference_id: raw.reference_id,
      channel_code: raw.channel_code,
      description: raw.description,
    }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
