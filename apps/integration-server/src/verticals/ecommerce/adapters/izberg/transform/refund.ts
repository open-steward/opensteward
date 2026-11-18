/**
 * IZBERG Refund → canonical Refund.
 *
 * IZBERG exposes refunds via the `refund` resource. A refund is always
 * linked to a merchant_order.
 *
 * Endpoint: GET /v1/refund/, GET /v1/refund/{id}/
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

// ── Raw IZBERG shape ─────────────────────────────────────────────────────────

export interface RawIzbergRefund {
  id: number | string
  resource_uri?: string
  merchant_order?: number | string | null
  order?: number | string | null
  amount?: string | number | null
  currency?: string | null
  reason?: string | null
  note?: string | null
  status?: string | null
  date_created?: string | null
  date_modified?: string | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

export function transformRefund(raw: RawIzbergRefund, merchantOrderId?: string): Refund {
  const currency = raw.currency ?? 'EUR'
  const orderId =
    merchantOrderId ??
    (raw.merchant_order != null ? String(raw.merchant_order) : null) ??
    (raw.order != null ? String(raw.order) : '')

  return {
    id: String(raw.id),
    orderId,
    amount:
      raw.amount != null
        ? { amount: majorToMinor(toNum(raw.amount), currency), currency }
        : undefined,
    reason: raw.reason ?? undefined,
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.date_created),
    processedAt: toIsoDatetime(raw.date_created),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Refund → IZBERG refund body (for create). */
export function untransformRefund(refund: Partial<Refund>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    reason: refund.reason,
    note: refund.note,
  }
  if (refund.amount?.amount != null) {
    const currency = refund.amount.currency
    // Convert minor → major-unit decimal string (currency-aware)
    const major = minorToMajor(refund.amount.amount, currency)
    body['amount'] = major != null ? major.toFixed(2) : '0.00'
    body['currency'] = currency
  }
  if (refund.orderId) {
    body['merchant_order'] = refund.orderId
  }
  return body
}
