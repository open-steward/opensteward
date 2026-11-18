/**
 * Solidus Promotion -> canonical Discount.
 *
 * Solidus promotions live under `/api/v2/platform/promotions` and are
 * nearly identical to Spree promotions:
 *  - `name`, `description`, `code` (via promotion_codes)
 *  - `starts_at` / `expires_at`
 *  - `usage_limit` / `usage_count`
 *  - Actions define the discount type and value
 *  - Rules define eligibility
 *
 * Solidus-specific:
 *  - Action class names use `Solidus::` namespace prefix (not `Spree::`)
 *    but this adapter handles both namespaces for compatibility.
 *  - Solidus may use `Solidus::Promotion::Actions::CreateAdjustment` etc.
 */

import type {
  Discount,
  DiscountType,
  DiscountAppliesTo,
} from '../../../schema/discount'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawSolidusPromotionCode {
  id?: number | string
  value?: string
  promotion_id?: number | string
  [key: string]: unknown
}

export interface RawSolidusPromotionAction {
  id?: number | string
  type?: string
  amount?: string | number
  calculator_type?: string
  [key: string]: unknown
}

export interface RawSolidusPromotionRule {
  id?: number | string
  type?: string
  preferred_amount_min?: string | number
  preferred_amount_max?: string | number
  product_ids?: Array<number | string>
  taxon_ids?: Array<number | string>
  [key: string]: unknown
}

export interface RawSolidusPromotion {
  id: number | string
  name: string
  description?: string | null
  code?: string | null
  starts_at?: string | null
  expires_at?: string | null
  usage_limit?: number | null
  usage_count?: number
  match_policy?: string // 'all' | 'any'
  advertise?: boolean
  path?: string | null
  type?: string
  per_code_usage_limit?: number | null
  apply_automatically?: boolean
  promotion_codes?: RawSolidusPromotionCode[]
  promotion_actions?: RawSolidusPromotionAction[]
  promotion_rules?: RawSolidusPromotionRule[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function inferType(actions: RawSolidusPromotionAction[] | undefined): DiscountType | undefined {
  if (!actions || actions.length === 0) return undefined
  const first = actions[0]
  if (!first) return undefined
  // Handle both Spree:: and Solidus:: namespaces
  if (first.type?.includes('FreeShipping')) return 'FREE_SHIPPING'
  if (first.calculator_type?.includes('Percent') || first.calculator_type?.includes('percent')) {
    return 'PERCENTAGE'
  }
  if (first.calculator_type?.includes('FlatRate') || first.calculator_type?.includes('flat_rate')) {
    return 'FIXED_AMOUNT'
  }
  if (first.amount != null) return 'FIXED_AMOUNT'
  return undefined
}

function inferValue(actions: RawSolidusPromotionAction[] | undefined): number | undefined {
  if (!actions || actions.length === 0) return undefined
  const first = actions[0]
  return first?.amount != null ? toNum(first.amount) : undefined
}

function inferAppliesTo(
  actions: RawSolidusPromotionAction[] | undefined,
  rules: RawSolidusPromotionRule[] | undefined,
): DiscountAppliesTo | undefined {
  if (actions?.some((a) => a.type?.includes('FreeShipping'))) return 'SHIPPING'
  if (rules?.some((r) => r.product_ids && r.product_ids.length > 0)) return 'PRODUCTS'
  return 'ORDER'
}

export function transformDiscount(raw: RawSolidusPromotion): Discount {
  const code = raw.code ?? raw.promotion_codes?.[0]?.value ?? undefined
  return {
    id: String(raw.id),
    code: code ?? undefined,
    title: raw.name,
    type: inferType(raw.promotion_actions),
    value: inferValue(raw.promotion_actions),
    appliesTo: inferAppliesTo(raw.promotion_actions, raw.promotion_rules),
    productIds: raw.promotion_rules
      ?.flatMap((r) => r.product_ids ?? [])
      .map(String),
    collectionIds: raw.promotion_rules
      ?.flatMap((r) => r.taxon_ids ?? [])
      .map(String),
    usageLimit: raw.usage_limit ?? undefined,
    usageCount: raw.usage_count,
    startsAt: raw.starts_at ?? undefined,
    endsAt: raw.expires_at ?? undefined,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  return {
    promotion: {
      name: discount.title ?? discount.code ?? 'Discount',
      description: discount.title,
      code: discount.code,
      starts_at: discount.startsAt,
      expires_at: discount.endsAt,
      usage_limit: discount.usageLimit,
    },
  }
}
