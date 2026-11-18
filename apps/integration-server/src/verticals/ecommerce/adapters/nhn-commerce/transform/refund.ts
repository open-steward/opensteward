/**
 * NHN Commerce (Shopby) Claim (Cancel/Return) → canonical Refund.
 *
 * Shopby uses a "claim" model for cancellations and returns. Claims are
 * listed via GET /profile/claims and detail via GET /profile/claims/{claimNo}.
 *
 * The Shopby shop API does not expose a direct "refund amount" field; the
 * claim result endpoint returns estimated refund amounts via
 * GET /profile/claims/{claimNo}/result.
 */

import type { Refund } from '../../../schema/refund'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { DEFAULT_CURRENCY } from './product'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

export interface RawNhnClaimItem {
  claimNo?: number | string
  orderNo?: string | null
  orderOptionNo?: number | string | null
  claimType?: string | null // CANCEL, RETURN, EXCHANGE
  claimReasonType?: string | null
  claimReasonDetail?: string | null
  claimStatusType?: string | null
  refundAmt?: number | null
  registerYmdt?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(amount: number | null | undefined, currency = DEFAULT_CURRENCY) {
  if (amount == null) return undefined
  return { amount: majorToMinor(amount, currency), currency }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformClaim(raw: RawNhnClaimItem, currency = DEFAULT_CURRENCY): Refund {
  return {
    id: String(raw.claimNo ?? ''),
    orderId: raw.orderNo ?? '',
    amount: toMoney(raw.refundAmt, currency),
    reason: raw.claimReasonDetail ?? raw.claimReasonType ?? undefined,
    refundLineItems: raw.orderOptionNo != null
      ? [{ lineItemId: String(raw.orderOptionNo), quantity: 1 }]
      : undefined,
    processedAt: toIsoDatetime(raw.registerYmdt),
    createdAt: toIsoDatetime(raw.registerYmdt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → Shopby cancel/return claim request body. */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  return {
    claimReasonType: 'CHANGE_MIND',
    claimReasonDetail: refund.reason,
    refundType: 'ACCOUNT',
    orderOptionNos: (refund.refundLineItems ?? []).map((li) => li.lineItemId),
  }
}
