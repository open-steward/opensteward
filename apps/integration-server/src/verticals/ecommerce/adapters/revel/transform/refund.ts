/**
 * Revel OrderRefund → canonical Refund.
 *
 * Revel refunds are accessible via `/resources/OrderPayment/` with
 * negative amounts, or via a refund-specific filter.
 */

import type { Refund } from '../../../schema/refund'
import { extractId } from './inventory'
import { majorToMinor } from '../../../schema/shared'

export interface RawRevelRefund {
  id: number
  order?: string | number // resource URI or ID
  amount?: number // positive refund amount
  reason?: string
  created_date?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawRevelRefund): Refund {
  const currency = 'USD'
  const orderId = raw.order ? extractId(raw.order as string | number) : ''

  return {
    id: String(raw.id),
    orderId,
    amount: raw.amount != null
      ? { amount: majorToMinor(raw.amount, currency), currency }
      : undefined,
    reason: raw.reason ?? undefined,
    createdAt: raw.created_date ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Revel refund request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (refund.amount?.amount != null) body['amount'] = refund.amount.amount / 100
  if (refund.reason != null) body['reason'] = refund.reason
  return body
}
