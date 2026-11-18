/**
 * commercetools ProductVariant → canonical ProductVariant.
 *
 * Lives in its own file (vs. inlined in product.ts) because the same
 * transform is used both when unpacking a ProductProjection and when the
 * adapter's `listVariants`/`getVariant` reads a variant out of a parent
 * product. The commercetools "variant" is always nested under a
 * product — there is no flat `/variants` endpoint.
 *
 * Money: commercetools stores prices as typed `{centAmount, currencyCode,
 * fractionDigits}` records inside a `prices[]` array. We pick the first
 * price (the "list" price) as the canonical primary price — callers who
 * need currency/customer-group specific prices should read the raw
 * `prices` array from `metadata`.
 *
 * Attributes: variant attributes live as `[{name, value}]`. When the
 * value is a scalar it maps directly into canonical `optionValues`. When
 * the value is itself a localized string (`{en-US: 'Red'}`) we pick the
 * primary locale.
 */

import type { ProductVariant } from '../../../schema/product'
import type { Money } from '../../../schema/shared'
import { DEFAULT_LOCALE } from '../constants'

export interface RawCtMoney {
  type?: string
  centAmount: number
  currencyCode: string
  fractionDigits?: number
}

export interface RawCtPrice {
  id?: string
  value: RawCtMoney
  country?: string
  customerGroup?: { id: string; typeId: 'customer-group' }
  channel?: { id: string; typeId: 'channel' }
  validFrom?: string
  validUntil?: string
  discounted?: { value: RawCtMoney }
}

export interface RawCtImage {
  url: string
  label?: string
  dimensions?: { w: number; h: number }
}

export type RawCtLocalizedString = Record<string, string>

export interface RawCtAttribute {
  name: string
  value:
    | string
    | number
    | boolean
    | RawCtLocalizedString
    | { key?: string; label?: string | RawCtLocalizedString }
    | unknown
}

export interface RawCtVariant {
  id: number
  sku?: string
  key?: string
  prices?: RawCtPrice[]
  images?: RawCtImage[]
  attributes?: RawCtAttribute[]
  assets?: unknown[]
  availability?: {
    availableQuantity?: number
    isOnStock?: boolean
    channels?: Record<string, { availableQuantity?: number; isOnStock?: boolean }>
  }
  [key: string]: unknown
}

/**
 * Convert a commercetools Money record to canonical Money. Handles the
 * `fractionDigits` field (e.g. 0 for JPY/KRW, 2 for most currencies).
 */
export function moneyFromCt(m: RawCtMoney | undefined): Money | undefined {
  if (!m) return undefined
  // commercetools `centAmount` is already an integer in the currency's minor
  // units, which matches the canonical `Money.amount` contract. Pass it through.
  return { amount: Math.round(m.centAmount), currency: m.currencyCode }
}

/**
 * Pick the primary value from a commercetools LocalizedString. Prefers
 * the supplied locale (usually `en-US`), falls back to the first key in
 * insertion order.
 */
export function pickLocalized(
  ls: RawCtLocalizedString | string | undefined,
  locale: string = DEFAULT_LOCALE,
): string | undefined {
  if (ls == null) return undefined
  if (typeof ls === 'string') return ls
  if (typeof ls !== 'object') return undefined
  if (locale in ls) return ls[locale]
  const firstKey = Object.keys(ls)[0]
  return firstKey != null ? ls[firstKey] : undefined
}

/**
 * Best-effort extraction of a scalar string from a commercetools attribute
 * value. The platform's attribute values are polymorphic (plain scalars,
 * LocalizedString maps, Reference objects, Enum objects, lists, …). Return
 * `undefined` when there's no sensible scalar.
 */
export function attributeValueToString(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // Enum value: `{ key, label }`
    if (typeof obj['key'] === 'string') {
      const label = obj['label']
      if (typeof label === 'string') return label
      if (label && typeof label === 'object') {
        return pickLocalized(label as RawCtLocalizedString)
      }
      return obj['key'] as string
    }
    // LocalizedString-shaped: all values are strings
    const values = Object.values(obj)
    if (values.every((v) => typeof v === 'string') && values.length > 0) {
      return pickLocalized(obj as RawCtLocalizedString)
    }
  }
  return undefined
}

function optionValuesFromAttributes(
  attributes: RawCtAttribute[] | undefined,
): Record<string, string> | undefined {
  if (!attributes || attributes.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const a of attributes) {
    const s = attributeValueToString(a.value)
    if (s !== undefined) out[a.name] = s
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawCtVariant,
  productId?: string,
  position?: number,
): ProductVariant {
  const primaryPrice = raw.prices?.[0]
  const price = moneyFromCt(primaryPrice?.value) ?? { amount: 0, currency: 'USD' }
  const discounted = primaryPrice?.discounted ? moneyFromCt(primaryPrice.discounted.value) : undefined
  return {
    id: productId ? `${productId}:${raw.id}` : String(raw.id),
    productId,
    sku: raw.sku ?? undefined,
    title: raw.key,
    price,
    // commercetools "discounted" price plays the same role as
    // Shopify's compareAt — the canonical meaning is "pre-discount list
    // price". Preserve the un-discounted list price as compareAt so the
    // canonical `price` always reflects what the buyer actually pays.
    compareAtPrice: discounted ? price : undefined,
    optionValues: optionValuesFromAttributes(raw.attributes),
    inventoryItemId: raw.sku ?? String(raw.id),
    position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Build a commercetools "addVariant"-style partial body from a canonical
 * ProductVariant. This is the reverse of {@link transformVariant} but
 * does NOT itself wrap the fields in an action — that's the caller's job
 * (see `buildActionsForProduct`). Exposed so tests can round-trip the
 * writable fields.
 */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const prices: Record<string, unknown>[] = []
  if (variant.price) {
    prices.push({
      value: {
        type: 'centPrecision',
        currencyCode: variant.price.currency,
        centAmount: Math.round(variant.price.amount),
      },
    })
  }
  const attributes: Array<{ name: string; value: unknown }> = []
  if (variant.optionValues) {
    for (const [name, value] of Object.entries(variant.optionValues)) {
      attributes.push({ name, value })
    }
  }
  return {
    sku: variant.sku,
    key: variant.title,
    prices: prices.length > 0 ? prices : undefined,
    attributes: attributes.length > 0 ? attributes : undefined,
  }
}
