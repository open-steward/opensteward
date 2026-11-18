/**
 * Thirty Bees Cart Rule → canonical Discount.
 *
 * Thirty Bees (PrestaShop 1.6 fork) calls promotions "cart rules" and exposes
 * them via `/api/cart_rules`. A cart rule may carry a redeemable code via its
 * `code` field. Amounts are stored as decimal major-unit strings (e.g. "5.00").
 * Reduction types:
 *   reduction_percent != 0  → PERCENTAGE
 *   reduction_amount != 0   → FIXED_AMOUNT
 *   free_shipping = 1       → FREE_SHIPPING
 */

import type { Discount, DiscountType } from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Thirty Bees shape ───────────────────────────────────────────────────

export interface RawThirtyBeesCartRule {
  id: number | string
  name?: string | Record<string, string> | null
  code?: string | null
  reduction_percent?: string | number | null
  reduction_amount?: string | number | null
  free_shipping?: string | number | null
  active?: string | number | null
  date_from?: string | null
  date_to?: string | null
  date_add?: string | null
  date_upd?: string | null
  quantity?: string | number | null
  quantity_per_user?: string | number | null
  id_currency?: number | string | null
  minimum_amount?: string | number | null
  minimum_amount_currency?: number | string | null
  associations?: {
    product_rule_groups?: unknown[]
  }
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractName(
  v: string | Record<string, string> | null | undefined,
): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v || undefined
  const vals = Object.values(v)
  return vals.length > 0 ? vals[0] : undefined
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'number' ? v : parseFloat(v) || 0
}

function mapType(raw: RawThirtyBeesCartRule): DiscountType | undefined {
  if (toNum(raw.reduction_percent) > 0) return 'PERCENTAGE'
  if (toNum(raw.reduction_amount) > 0) return 'FIXED_AMOUNT'
  if (raw.free_shipping === 1 || raw.free_shipping === '1') return 'FREE_SHIPPING'
  return undefined
}

function mapValue(raw: RawThirtyBeesCartRule): number | undefined {
  if (toNum(raw.reduction_percent) > 0) return toNum(raw.reduction_percent)
  if (toNum(raw.reduction_amount) > 0) return toNum(raw.reduction_amount)
  return undefined
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformDiscount(raw: RawThirtyBeesCartRule): Discount {
  const usageLimit = raw.quantity != null ? toNum(raw.quantity) : undefined
  const minimumAmt = raw.minimum_amount != null ? toNum(raw.minimum_amount) : undefined

  return {
    id: String(raw.id),
    code: raw.code ?? undefined,
    title: extractName(raw.name),
    type: mapType(raw),
    value: mapValue(raw),
    appliesTo: 'ORDER',
    customerEligibility: 'ALL',
    usageLimit: usageLimit && usageLimit > 0 ? usageLimit : undefined,
    minimumPurchaseAmount:
      minimumAmt && minimumAmt > 0
        ? { amount: Math.round(minimumAmt * 100), currency: 'EUR' }
        : undefined,
    startsAt: toIsoDatetime(raw.date_from),
    endsAt: toIsoDatetime(raw.date_to),
    createdAt: toIsoDatetime(raw.date_add),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → Thirty Bees cart rule body (for create / update). */
export function untransformDiscount(
  discount: Partial<Discount>,
): Record<string, unknown> {
  const isPercent = discount.type === 'PERCENTAGE'
  const isFixed = discount.type === 'FIXED_AMOUNT'
  const isFreeShip = discount.type === 'FREE_SHIPPING'
  return {
    name: discount.title,
    code: discount.code ?? '',
    active: 1,
    reduction_percent: isPercent ? String(discount.value ?? 0) : '0',
    reduction_amount: isFixed ? String(discount.value ?? 0) : '0',
    free_shipping: isFreeShip ? 1 : 0,
    date_from: discount.startsAt,
    date_to: discount.endsAt,
    quantity: discount.usageLimit ?? 0,
  }
}
