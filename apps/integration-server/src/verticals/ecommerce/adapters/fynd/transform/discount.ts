/**
 * Fynd coupon ⇄ canonical Discount.
 *
 * Source: `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Cart/CartPlatformApplicationClient.js` — `getCoupons`
 * (`GET cart/v1.0/company/{id}/application/{appId}/coupon`), `getCouponById`
 * (`GET .../coupon/{id}`), `createCoupon` (`POST .../coupon`, body
 * `CartPlatformModel.CouponAdd()`), `updateCoupon` (`PUT .../coupon/{id}`,
 * body `CouponUpdate()`), `deleteCoupon` (`DELETE .../coupon/{id}`).
 *
 * Note the earlier Discount PLATFORM module (`DiscountPlatformClient`,
 * `catalog/discount/v1.0/company/{id}/job/`) is NOT this resource — that
 * API manages async bulk product-price-change upload jobs
 * (`DiscountJob`), not coupon/promo-code objects, so it is not used here.
 *
 * `type` reads `type_slug` only (not `rule_definition.value_type` as a
 * fallback): `type_slug` is the coupon's own required field (`CouponUpdate`
 * marks it `.required()`); `rule_definition.value_type` is a different,
 * optional field on a nested object with no documented relationship to it,
 * so treating them as interchangeable would be a guess.
 *
 * `create`/`updateCoupon` both respond with `{success, message, _id}`
 * (`CouponCreateResult`) — no full object — so `createDiscount` and
 * `updateDiscount` follow up with `getCouponById` to return the transformed
 * canonical shape.
 */
import type { Discount, DiscountType } from '../../../schema/discount'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawFyndCoupon {
  _id: string
  code?: string
  type_slug?: string
  rule?: Array<{ value?: number }>
  rule_definition?: { currency_code?: string }
  identifiers?: { item_id?: number[]; collection_id?: string[] }
  restrictions?: { uses?: { maximum?: { total?: number }; remaining?: { total?: number } } }
  _schedule?: { start?: string | null; end?: string | null }
  date_meta?: { created_on?: string | null }
}

function toIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Fynd's `type_slug` → canonical DiscountType. Values other than the two
 *  recognised here (Fynd's catalog includes more, e.g. `bogo`) pass through
 *  unchanged — `DiscountTypeSchema` is `withUnknown`, so an unrecognised
 *  slug still validates rather than being forced into the wrong bucket. */
function toDiscountType(typeSlug: string | undefined): DiscountType | undefined {
  if (typeSlug === 'percentage') return 'PERCENTAGE'
  if (typeSlug === 'amount') return 'FIXED_AMOUNT'
  return typeSlug as DiscountType | undefined
}

export function transformDiscount(raw: RawFyndCoupon): Discount {
  if (!raw._id) throw new Error('Fynd coupon is missing _id')
  const rule = raw.rule?.[0]
  const currency = raw.rule_definition?.currency_code
  const type = toDiscountType(raw.type_slug)
  const value =
    rule?.value != null ? (type === 'FIXED_AMOUNT' && currency ? minorToMajor(rule.value, currency) : rule.value) : undefined
  const maxUses = raw.restrictions?.uses?.maximum?.total
  const remainingUses = raw.restrictions?.uses?.remaining?.total
  return {
    id: raw._id,
    code: raw.code || undefined,
    title: raw.code || undefined,
    type,
    value,
    currency: currency || undefined,
    productIds: raw.identifiers?.item_id?.map(String),
    collectionIds: raw.identifiers?.collection_id,
    usageLimit: maxUses,
    usageCount: maxUses != null && remainingUses != null ? maxUses - remainingUses : undefined,
    startsAt: toIso(raw._schedule?.start),
    endsAt: toIso(raw._schedule?.end),
    createdAt: toIso(raw.date_meta?.created_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Body for `POST .../coupon` (`CouponAdd`) / `PUT .../coupon/{id}` (`CouponUpdate`).
 *  Both require `code` and `type_slug`; a percentage/fixed-amount value maps
 *  onto a single-entry `rule[]`. */
export function untransformDiscount(data: Partial<Discount>): Record<string, unknown> {
  const typeSlug = data.type === 'PERCENTAGE' ? 'percentage' : data.type === 'FIXED_AMOUNT' ? 'amount' : undefined
  const ruleValue =
    data.value != null
      ? data.type === 'FIXED_AMOUNT' && data.currency
        ? majorToMinor(data.value, data.currency)
        : data.value
      : undefined
  const body: Record<string, unknown> = {
    code: data.code,
    type_slug: typeSlug,
  }
  if (ruleValue != null) {
    body.rule = [{ value: ruleValue }]
  }
  if (data.currency) {
    body.rule_definition = { currency_code: data.currency }
  }
  if (data.productIds || data.collectionIds) {
    body.identifiers = {
      ...(data.productIds ? { item_id: data.productIds.map(Number) } : {}),
      ...(data.collectionIds ? { collection_id: data.collectionIds } : {}),
    }
  }
  if (data.usageLimit != null) {
    body.restrictions = { uses: { maximum: { total: data.usageLimit } } }
  }
  if (data.startsAt || data.endsAt) {
    body._schedule = {
      ...(data.startsAt ? { start: data.startsAt } : {}),
      ...(data.endsAt ? { end: data.endsAt } : {}),
    }
  }
  return body
}
