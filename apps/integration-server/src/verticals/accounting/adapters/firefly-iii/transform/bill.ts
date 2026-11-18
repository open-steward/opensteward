/**
 * Maps a Firefly III Bill (subscription) to the canonical Bill type.
 *
 * Firefly III calls recurring-payment agreements "bills" (or "subscriptions"
 * in newer versions).  They represent expected periodic outflows — analogous
 * to a standing order or recurring payable — which maps to the canonical Bill.
 *
 * Fields:
 *   name         → billNumber / notes
 *   amount_min / amount_max / amount_avg   → totalAmount (avg preferred)
 *   date         → postedAt
 *   end_date     → dueAt
 *   currency_code → currency
 *   active       → AUTHORIZED vs VOIDED
 *   repeat_freq  → metadata
 */

import type { Bill, BillStatus } from '../../../schema/bill'

// ── Firefly III raw type ────────────────────────────────────────────────────────

export interface FireflyBillAttributes {
  created_at: string
  updated_at: string
  name: string
  currency_id: string
  currency_code: string
  amount_min: string
  amount_max: string
  amount_avg: string
  date: string
  end_date: string | null
  extension_date: string | null
  repeat_freq: string
  skip: number
  active: boolean
  notes: string | null
  [key: string]: unknown
}

export type FireflyBillResource = {
  type: string
  id: string
  attributes: FireflyBillAttributes
}

// ── Transform ─────────────────────────────────────────────────────────────────

function mapStatus(attrs: FireflyBillAttributes): BillStatus {
  if (!attrs.active) return 'VOIDED'
  if (attrs.end_date && new Date(attrs.end_date).getTime() < Date.now()) return 'PAID'
  return 'AUTHORIZED'
}

/** Convert a Firefly III decimal string (e.g. '12.50') to integer minor units (e.g. 1250). */
function toMinorUnits(raw: unknown): number | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const parsed = parseFloat(String(raw))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

export function transformBill(raw: FireflyBillResource): Bill {
  const attrs = raw.attributes

  // Prefer the average amount; fall back to the minimum.
  const rawAmount = attrs.amount_avg || attrs.amount_min

  return {
    id: raw.id,
    status: mapStatus(attrs),
    billNumber: attrs.name || undefined,
    currency: attrs.currency_code || undefined,
    totalAmount: toMinorUnits(rawAmount),
    postedAt: attrs.date ? new Date(attrs.date) : undefined,
    dueAt: attrs.end_date ? new Date(attrs.end_date) : undefined,
    createdAt: attrs.created_at ? new Date(attrs.created_at) : undefined,
    updatedAt: attrs.updated_at ? new Date(attrs.updated_at) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
