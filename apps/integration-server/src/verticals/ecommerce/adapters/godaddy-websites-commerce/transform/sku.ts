/**
 * GoDaddy catalog SKU → canonical ProductVariant.
 *
 * "Each SKU represents one specific, purchasable variant."
 * — https://developer.godaddy.com/docs/api-users/commerce
 *
 * Fields are the ones the `sku` reference documents on `SKU`
 * (https://developer.godaddy.com/docs/references/rest/catalog/sku/queries/sku).
 *
 * Price: `prices` is "all the prices the SKU can be sold at. The price can be
 * different based the channel where it is listed or if there is a promotion
 * running." The docs name no default among them, so a SKU maps only when it
 * has exactly one price; with none or several there is no documented source
 * for the canonical (required) `price`, and the transform throws instead of
 * choosing one. Price values are "Integer minor units in the smallest currency
 * unit (for USD, cents: `1999` = $19.99)" (SimpleMoneyInput.value), which is
 * the canonical `Money.amount` unit already.
 */

import type { ProductVariant, WeightUnit } from '../../../schema/product'
import type { Money } from '../../../schema/shared'

/** `SimpleMoney`: "a money object that includes the value and currency code." */
export interface RawGoDaddySimpleMoney {
  value: number
  currencyCode: string
}

/** `SKUPrice`: "Represents the cost of a SKU". */
export interface RawGoDaddySkuPrice {
  value: RawGoDaddySimpleMoney
  compareAtValue?: RawGoDaddySimpleMoney | null
}

/** The `SKU` fields `SKU_FIELDS` selects. */
export interface RawGoDaddySku {
  /** "The globally-unique ID of the SKU." */
  id: string
  /** "The unique code for the SKU." */
  code: string
  /** "A unique name for the SKU." */
  name: string
  /** "The display label of the SKU." */
  label?: string | null
  /** "The status of the SKU, one of `DRAFT`, `ACTIVE`, `ARCHIVED`." */
  status?: string | null
  /** "The weight of the SKU." */
  weight?: number | null
  /** "The unit of weight, one of `KG`, `GR`, `LB`, `OZ`." */
  unitOfWeight?: string | null
  /** "Flag to mark whether the SKU should be shipped or not." */
  disableShipping?: boolean | null
  /** "A SKU group is a grouping of related SKUs." */
  skuGroup?: { id: string } | null
  /** "These are all the prices the SKU can be sold at." */
  prices?: { edges?: Array<{ node?: RawGoDaddySkuPrice | null } | null> | null } | null
  createdAt: string
  updatedAt: string
}

/** GraphQL selection for a `SKU`, kept beside the type it fills. */
export const SKU_FIELDS =
  'id code name label status weight unitOfWeight disableShipping createdAt updatedAt ' +
  'skuGroup { id } ' +
  'prices { edges { node { value { value currencyCode } compareAtValue { value currencyCode } } } }'

const WEIGHT_UNITS: Record<string, WeightUnit> = { KG: 'kg', GR: 'g', LB: 'lb', OZ: 'oz' }

function toMoney(raw: RawGoDaddySimpleMoney): Money {
  return { amount: raw.value, currency: raw.currencyCode }
}

export function transformSku(raw: RawGoDaddySku): ProductVariant {
  const prices = (raw.prices?.edges ?? []).flatMap((e) => (e?.node ? [e.node] : []))
  if (prices.length !== 1) {
    throw new Error(
      `GoDaddy SKU ${raw.id} has ${prices.length} prices; the docs name no default price, ` +
        'so a canonical variant price cannot be chosen',
    )
  }
  const price = prices[0]!
  const weightUnit = raw.unitOfWeight ? WEIGHT_UNITS[raw.unitOfWeight] : undefined
  return {
    id: raw.id,
    ...(raw.skuGroup?.id ? { productId: raw.skuGroup.id } : {}),
    sku: raw.code,
    title: raw.label ?? raw.name,
    price: toMoney(price.value),
    ...(price.compareAtValue ? { compareAtPrice: toMoney(price.compareAtValue) } : {}),
    ...(typeof raw.weight === 'number' && weightUnit ? { weight: raw.weight, weightUnit } : {}),
    ...(typeof raw.disableShipping === 'boolean' ? { requiresShipping: !raw.disableShipping } : {}),
    metadata: { ...raw },
  }
}
