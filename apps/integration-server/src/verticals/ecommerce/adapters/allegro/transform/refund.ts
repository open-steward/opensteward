/**
 * Allegro Dispute → canonical Refund.
 *
 * Allegro handles refunds through its disputes system:
 *   GET /sale/disputes → list
 *   GET /sale/disputes/{disputeId} → get
 *
 * Disputes contain refund information when resolved. We map resolved
 * disputes with refund outcomes to canonical Refund objects.
 */

import type { Refund } from '../../../schema/refund'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAllegroDispute {
  id: string
  checkoutForm?: {
    id?: string
  }
  subject?: string
  message?: string
  status?: string
  resolvedAt?: string
  createdAt?: string
  updatedAt?: string
  buyer?: {
    id?: string
    login?: string
  }
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformRefund(raw: RawAllegroDispute): Refund {
  return {
    id: raw.id,
    orderId: raw.checkoutForm?.id ?? 'unknown',
    reason: raw.subject,
    note: raw.message,
    processedAt: raw.resolvedAt,
    createdAt: raw.createdAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Refund → Allegro create dispute message body.
 */
export function untransformRefund(data: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.orderId) {
    body['checkoutForm'] = { id: data.orderId }
  }
  if (data.reason) body['subject'] = data.reason
  if (data.note) body['message'] = data.note
  return body
}
