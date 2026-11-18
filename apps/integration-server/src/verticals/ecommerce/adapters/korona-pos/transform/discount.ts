/**
 * KORONA Promotion → canonical Discount.
 *
 * Shape verified against `components.schemas.Promotion`,
 * `PromotionBenefit`, `PromotionBenefitCommonDiscount`, `PromotionCoupon`
 * and `PromotionValidity` on
 * https://128.koronacloud.com/web/api/v3/openapi.json. Only
 * `type: COUPON_DISCOUNT | IMMEDIATE_DISCOUNT` with `benefit.type: COMMON`
 * is mapped — `EXTENDED` / `REDUCE_PRODUCT_AMOUNT` / `GRADUATED_DISCOUNT`
 * and the `BONUSPOINTS_*` / `STAMPS` / `BONUS_ITEMS` promotion types have no
 * documented shape this adapter has verified, so a `Promotion` of one of
 * those kinds surfaces with every canonical field but `id`/`title`/
 * `metadata` left undefined rather than guessed.
 *
 * `Discount.value` has no currency requirement on the canonical schema
 * (`z.number()`, not `Money`), so `PromotionBenefitCommonDiscount.value` is
 * used directly for both percentage and fixed-amount promotions — no
 * currency is invented for the `FIXED` case, and `Discount.currency` (a
 * separate, optional field) is left unset.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type {
  Discount,
  DiscountAppliesTo,
  DiscountType,
} from '../../../schema/discount'
import type { KoronaModelReference } from './product'

export interface KoronaPromotionBenefitCommon {
  applianceTarget?: 'PRODUCT' | 'PRODUCTS_OF_COMMODITY_GROUP' | 'PRODUCTS_WITH_TAG'
  unitType?: 'FIXED' | 'PERCENTAGE'
  value?: number
  targetProduct?: KoronaModelReference
  targetCommodityGroup?: KoronaModelReference
}

export interface KoronaPromotionBenefit {
  type?: 'COMMON' | 'EXTENDED' | 'REDUCE_PRODUCT_AMOUNT' | 'GRADUATED_DISCOUNT'
  common?: KoronaPromotionBenefitCommon
}

export interface KoronaPromotionCoupon {
  text?: string
}

export interface KoronaDateInterval {
  from?: string
  to?: string
}

export interface KoronaPromotionValidity {
  dateInterval?: KoronaDateInterval
}

export interface KoronaPromotion {
  id: string
  number?: string
  name?: string
  type?: 'BONUSPOINTS_CASHIER' | 'BONUSPOINTS_CUSTOMER' | 'COUPON_DISCOUNT' | 'IMMEDIATE_DISCOUNT' | 'STAMPS' | 'BONUS_ITEMS'
  benefit?: KoronaPromotionBenefit
  coupon?: KoronaPromotionCoupon
  validity?: KoronaPromotionValidity
}

const APPLIES_TO_MAP: Record<string, DiscountAppliesTo> = {
  PRODUCT: 'PRODUCTS',
  PRODUCTS_OF_COMMODITY_GROUP: 'PRODUCTS',
  PRODUCTS_WITH_TAG: 'PRODUCTS',
}

const TYPE_MAP: Record<string, DiscountType> = {
  FIXED: 'FIXED_AMOUNT',
  PERCENTAGE: 'PERCENTAGE',
}

/** Only a discount/coupon promotion with a `COMMON` benefit has a verified
 *  shape — everything else is a recognised-but-unmapped promotion kind. */
function isMappable(raw: KoronaPromotion): boolean {
  return (
    (raw.type === 'COUPON_DISCOUNT' || raw.type === 'IMMEDIATE_DISCOUNT') &&
    raw.benefit?.type === 'COMMON'
  )
}

export function transformDiscount(raw: KoronaPromotion): Discount {
  if (!isMappable(raw)) {
    return { id: raw.id, metadata: raw as unknown as Record<string, unknown> }
  }
  const common = raw.benefit!.common
  return {
    id: raw.id,
    code: raw.coupon?.text,
    title: raw.name,
    type: common?.unitType ? TYPE_MAP[common.unitType] : undefined,
    value: common?.value,
    appliesTo: common?.applianceTarget ? APPLIES_TO_MAP[common.applianceTarget] : undefined,
    productIds: common?.targetProduct ? [common.targetProduct.id] : undefined,
    collectionIds: common?.targetCommodityGroup ? [common.targetCommodityGroup.id] : undefined,
    startsAt: toIsoDatetime(raw.validity?.dateInterval?.from),
    endsAt: toIsoDatetime(raw.validity?.dateInterval?.to),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Discount → KORONA body for `POST /promotions` (add,
 *  array-batched) / `PATCH /promotions/{id}` (edit). Always writes a
 *  `COMMON`-benefit `COUPON_DISCOUNT` (when `code` is set) or
 *  `IMMEDIATE_DISCOUNT` — the only shape this adapter has verified. */
export function untransformDiscount(discount: Partial<Discount>): Record<string, unknown> {
  const unitType = discount.type === 'PERCENTAGE' ? 'PERCENTAGE' : discount.type === 'FIXED_AMOUNT' ? 'FIXED' : undefined
  const applianceTarget = discount.appliesTo === 'PRODUCTS' ? 'PRODUCT' : undefined
  const body: Record<string, unknown> = {
    type: discount.code ? 'COUPON_DISCOUNT' : 'IMMEDIATE_DISCOUNT',
    name: discount.title,
    benefit: {
      type: 'COMMON',
      common: {
        unitType,
        value: discount.value,
        applianceTarget,
        targetProduct: discount.productIds?.[0] ? { id: discount.productIds[0] } : undefined,
        targetCommodityGroup: discount.collectionIds?.[0] ? { id: discount.collectionIds[0] } : undefined,
      },
    },
  }
  if (discount.code) body['coupon'] = { codeType: 'CODEWORD', text: discount.code }
  if (discount.startsAt || discount.endsAt) {
    body['validity'] = {
      dateInterval: {
        from: discount.startsAt?.slice(0, 10),
        to: discount.endsAt?.slice(0, 10),
      },
    }
  }
  return body
}
