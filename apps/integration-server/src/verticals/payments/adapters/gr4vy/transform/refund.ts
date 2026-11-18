import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap } from './shared'

/**
 * A Gr4vy *refund* is created against a transaction and maps to a canonical
 * Refund. Amounts are integer minor units.
 *
 * Docs: https://docs.gr4vy.com/reference/transactions/refund-transaction
 */
export interface RawGr4vyRefund {
  id?: string
  transaction_id?: string
  status?: string
  currency?: string
  amount?: number
  reason?: string | null
  target_type?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(status: string | undefined): RefundStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
    case 'declined':
      return 'failed'
    case 'voided':
      return 'cancelled'
    case 'processing':
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawGr4vyRefund, fallbackChargeId?: string): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: pickStr(raw.transaction_id) ?? fallbackChargeId ?? '',
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw.status),
    gateway: 'gr4vy',
    metadata: strMap({ reason: raw.reason, target_type: raw.target_type }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
