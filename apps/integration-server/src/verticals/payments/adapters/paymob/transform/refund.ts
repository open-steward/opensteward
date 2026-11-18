import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { pickCurrency, strMap, asBool } from './shared'

/**
 * Paymob refund response.
 *
 * `POST /acceptance/void_refund/refund` settles a refund and echoes back a
 * transaction object: a child refund transaction carrying its own `id`,
 * `amount_cents`, the refunded `currency`, a `success` flag, and a pointer to
 * the original (parent) transaction via `parent_transaction` /
 * `has_parent_transaction`. We map that child id to the canonical refund id and
 * the parent transaction id to `chargeId`.
 */
export interface RawPaymobRefund {
  id?: number | string
  parent_transaction?: number | string | { id?: number | string } | null
  has_parent_transaction?: boolean | string
  amount_cents?: number
  currency?: string | null
  success?: boolean | string
  pending?: boolean | string
  error_occured?: boolean | string
  data?: { message?: string | null } | null
  order?: { id?: number | string } | null
  created_at?: string | null
  [k: string]: unknown
}

function parentId(raw: RawPaymobRefund): string {
  const p = raw.parent_transaction
  if (p && typeof p === 'object') return String(p.id ?? '')
  if (p != null) return String(p)
  return ''
}

export function transformRefund(raw: RawPaymobRefund): Refund {
  const status = asBool(raw.success)
    ? 'succeeded'
    : asBool(raw.error_occured)
      ? 'failed'
      : 'pending'
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: parentId(raw),
    amount: raw.amount_cents ?? 0,
    currency: pickCurrency(raw.currency),
    status,
    failureReason: raw.data?.message ?? undefined,
    gateway: 'paymob',
    metadata: strMap({ order_id: raw.order?.id, message: raw.data?.message }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
