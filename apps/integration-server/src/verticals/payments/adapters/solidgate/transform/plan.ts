import type { BillingInterval, Plan, Price, Product } from '../../../schema/plan'
import { sgDatetime, strMap } from './shared'

/**
 * A product from GET https://subscriptions.solidgate.com/api/v1/products
 * (`data[]`) or GET /products/{product_id}. Required: id, name, type
 * ([one-time] or [recurring]), description, status ([active|disabled|archived]),
 * created_at, updated_at; recurring products also require `billing_period`
 * ({ unit: [day|week|month|year], value: 1..730 }).
 */
export interface RawSolidgateProduct {
  id: string
  name: string
  type: string
  description?: string
  status: string
  created_at: string
  updated_at: string
  billing_period?: { unit: string; value: number }
  metadata?: Record<string, unknown>
}

/**
 * A price from GET /products/{product_id}/prices (`data[]`). Required: id,
 * default, status, created_at, updated_at, product_price, currency.
 *
 * Unit of `product_price`: the bundle says only "Product price." (integer,
 * 1..999999999, example 1000). Its sibling on the same object, `trial_price`
 * (same type and range, example 500), is documented in minor units: "You can
 * set the trial price to the desired amount in the smallest currency unit."
 * (https://docs.solidgate.com/billing/manage-products/prices/). Order and
 * transaction amounts in the bundle are in "the smallest currency unit" too,
 * so `product_price` is read as minor units; the docs do not say so for it
 * directly.
 */
export interface RawSolidgatePrice {
  id: string
  default: boolean
  status: string
  created_at: string
  updated_at: string
  product_price: number
  trial_price?: number
  currency: string
  country?: string
}

const INTERVALS = new Set<BillingInterval>(['day', 'week', 'month', 'year'])

function interval(p: RawSolidgateProduct): BillingInterval | undefined {
  const unit = p.billing_period?.unit
  return unit && INTERVALS.has(unit as BillingInterval) ? (unit as BillingInterval) : undefined
}

/**
 * A price is addressed only under its product (GET /products/{product_id}/prices),
 * so the canonical id is `<product_id>:<price_id>`, which `getPrice` and
 * `getPlan` split to read it back.
 */
export function priceKey(productId: string, priceId: string): string {
  return `${productId}:${priceId}`
}

export function transformProduct(raw: RawSolidgateProduct): Product {
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    ...(raw.description ? { description: raw.description } : {}),
    active: raw.status === 'active',
    gateway: 'solidgate',
    metadata: strMap(raw.metadata),
    createdAt: sgDatetime(raw.created_at),
    updatedAt: sgDatetime(raw.updated_at),
    raw,
  }
}

export function transformPrice(price: RawSolidgatePrice, product: RawSolidgateProduct): Price {
  const recurring = product.type === 'recurring'
  const unit = recurring ? interval(product) : undefined
  const metadata: Record<string, string> = { default: String(price.default) }
  if (price.country) metadata.country = price.country
  return {
    id: priceKey(product.id, price.id),
    externalId: price.id,
    productId: product.id,
    active: price.status === 'active',
    unitAmount: price.product_price,
    currency: price.currency.toUpperCase(),
    type: recurring ? 'recurring' : 'one_time',
    ...(unit ? { interval: unit, intervalCount: product.billing_period?.value } : {}),
    gateway: 'solidgate',
    metadata,
    createdAt: sgDatetime(price.created_at),
    updatedAt: sgDatetime(price.updated_at),
    raw: price,
  }
}

/**
 * A plan is one price of a recurring product. Returns null for a product with
 * no `billing_period` (one-time products have none), since a plan needs an
 * interval.
 */
export function transformPlan(price: RawSolidgatePrice, product: RawSolidgateProduct): Plan | null {
  // Only recurring products document a `billing_period`.
  const unit = interval(product)
  if (!unit) return null
  const metadata: Record<string, string> = { default: String(price.default) }
  if (price.country) metadata.country = price.country
  return {
    id: priceKey(product.id, price.id),
    externalId: price.id,
    productId: product.id,
    nickname: product.name,
    active: price.status === 'active' && product.status === 'active',
    amount: price.product_price,
    currency: price.currency.toUpperCase(),
    interval: unit,
    intervalCount: product.billing_period?.value,
    gateway: 'solidgate',
    metadata,
    createdAt: sgDatetime(price.created_at),
    updatedAt: sgDatetime(price.updated_at),
    raw: { product, price },
  }
}
