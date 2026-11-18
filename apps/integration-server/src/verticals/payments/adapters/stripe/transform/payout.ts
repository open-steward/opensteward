import type { Payout, PayoutMethod, PayoutStatus } from '../../../schema/payout'
import { toIso, strMap } from './shared'

export interface RawStripePayout {
  id: string
  object: 'payout'
  amount: number
  currency: string
  status: string
  method?: 'standard' | 'instant'
  arrival_date?: number
  destination?: string | null
  statement_descriptor?: string | null
  failure_code?: string | null
  failure_message?: string | null
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

function mapStatus(raw: RawStripePayout): PayoutStatus {
  switch (raw.status) {
    case 'paid':
      return 'paid'
    case 'pending':
      return 'pending'
    case 'in_transit':
      return 'in_transit'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function mapMethod(raw: RawStripePayout): PayoutMethod | undefined {
  if (raw.method === 'instant') return 'instant'
  if (raw.method === 'standard') return 'standard'
  return undefined
}

export function transformPayout(raw: RawStripePayout): Payout {
  return {
    id: raw.id,
    externalId: raw.id,
    amount: raw.amount,
    currency: raw.currency.toUpperCase(),
    status: mapStatus(raw),
    method: mapMethod(raw),
    arrivalDate: toIso(raw.arrival_date),
    statementDescriptor: raw.statement_descriptor ?? undefined,
    failureCode: raw.failure_code ?? undefined,
    failureMessage: raw.failure_message ?? undefined,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}
