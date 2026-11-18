/**
 * Crystallize Refund -> canonical Refund.
 *
 * Crystallize does not have a first-class refund model. Refunds are
 * tracked as order pipeline stage changes or external payment provider
 * refunds. We model them from order metadata.
 */

import type { Refund } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawCrystallizeRefund {
  id: string
  orderId: string
  amount?: { amount?: number; currency?: string } | null
  reason?: string | null
  createdAt?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawCrystallizeRefund): Refund {
  const currency = raw.amount?.currency ?? 'USD'
  return {
    id: raw.id,
    orderId: raw.orderId,
    amount: raw.amount?.amount != null
      ? { amount: majorToMinor(raw.amount.amount, currency), currency }
      : undefined,
    reason: raw.reason ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    amount: refund.amount?.amount,
    reason: refund.reason,
  }
}
