/**
 * ePages Beyond Product / Variation → canonical Product / ProductVariant.
 *
 * Docs: https://api-docs.beyondshop.cloud/ng-product-management-product-management-public-api.html
 *   - "Create product" / "Show product details" / "List products including
 *     variation products" / "Update product partially" / "Delete product"
 *   - "Create variation product" (POST /products with `variationAttributes`
 *     creates the parent AND every variation atomically — there is no
 *     endpoint to add a single variation afterwards)
 *   - "List variations" / "Show variation details" / "Update variation
 *     partially" (`/products/{id}/variations` and `/products/{id}/variations/{variationId}`)
 *
 * Beyond's resource id field is `_id` (not `sku` — SKU is a separate,
 * optional, mutable field). Prices are decimal major units
 * (`salesPrice.amount`), so `majorToMinor` converts them onto the canonical
 * integer-minor-unit `Money`.
 */

import type { Product, ProductVariant, ProductOption } from '../../../schema/product'
import { toIsoDatetime } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'

export interface RawEpagesMoney {
  amount?: number | null
  currency?: string
  taxModel?: string
}

export interface RawEpagesVariationAttribute {
  displayName: string
  values: string[]
}

export interface RawEpagesVariationAttributeValue {
  displayName: string
  value: string
}

export interface RawEpagesProduct {
  _id: string
  sku?: string | null
  name?: string
  description?: string | null
  manufacturer?: string | null
  tags?: string[]
  visible?: boolean
  salesPrice?: RawEpagesMoney
  listPrice?: RawEpagesMoney
  shippingWeight?: { value: number; displayUnit: string }
  variationAttributes?: RawEpagesVariationAttribute[]
  images?: { _id?: string; url?: string; position?: number }[]
  lastModifiedAt?: string
  [key: string]: unknown
}

export interface RawEpagesVariation {
  _id: string
  sku?: string | null
  salesPrice?: RawEpagesMoney
  visible?: boolean
  variationAttributeValues?: RawEpagesVariationAttributeValue[]
  lastModifiedAt?: string
  [key: string]: unknown
}

function mapMoney(raw: RawEpagesMoney | undefined): { amount: number; currency: string } | undefined {
  if (!raw || raw.amount == null || !raw.currency) return undefined
  return { amount: majorToMinor(raw.amount, raw.currency), currency: raw.currency }
}

function mapImages(raw: RawEpagesProduct): Image[] | undefined {
  const images = raw.images ?? []
  if (images.length === 0) return undefined
  return images
    .filter((img) => img.url)
    .map((img, idx) => ({ id: img._id, url: img.url!, position: img.position ?? idx }))
}

function mapOptions(raw: RawEpagesProduct): ProductOption[] | undefined {
  const attrs = raw.variationAttributes
  if (!attrs || attrs.length === 0) return undefined
  return attrs.map((a, position) => ({ name: a.displayName, values: a.values, position }))
}

export function transformVariation(
  raw: RawEpagesVariation,
  productId: string,
): ProductVariant {
  const optionValues: Record<string, string> = {}
  for (const v of raw.variationAttributeValues ?? []) optionValues[v.displayName] = v.value
  const price = mapMoney(raw.salesPrice)
  if (!price) {
    throw new Error(
      `ePages Beyond variation '${raw._id}' has no salesPrice — the canonical ProductVariant ` +
        'schema requires one and this adapter does not invent a price.',
    )
  }
  return {
    id: raw._id,
    productId,
    sku: raw.sku ?? undefined,
    price,
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `variations`, when supplied, is the full list fetched from
 * `GET /products/{id}/variations` (Beyond does not embed them on the
 * product resource itself).
 */
export function transformProduct(
  raw: RawEpagesProduct,
  variations?: RawEpagesVariation[],
): Product {
  if (!raw.name) {
    throw new Error(`ePages Beyond product '${raw._id}' has no name`)
  }
  return {
    id: raw._id,
    title: raw.name,
    description: raw.description ?? undefined,
    vendor: raw.manufacturer ?? undefined,
    tags: raw.tags,
    status: raw.visible === false ? 'DRAFT' : 'ACTIVE',
    options: mapOptions(raw),
    variants: variations && variations.length > 0
      ? variations.map((v) => transformVariation(v, raw._id))
      : undefined,
    images: mapImages(raw),
    updatedAt: toIsoDatetime(raw.lastModifiedAt),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `taxModel` (GROSS/NET) is a real Beyond field with no canonical `Money`
 * equivalent. Rather than inventing one, this reads it from the variant's
 * own `metadata.taxModel` (present whenever the variant came from
 * `transformVariation`/`transformProduct`, i.e. an update) and omits the key
 * entirely on a fresh create with no such metadata — Beyond applies the
 * shop's own default in that case instead of this adapter guessing one.
 */
function taxModelOf(variant: Partial<ProductVariant> | undefined): string | undefined {
  const raw = variant?.metadata as { salesPrice?: { taxModel?: string } } | undefined
  return raw?.salesPrice?.taxModel
}

/** Body for `POST /products` / `PATCH /products/{id}` (JSON merge patch). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const primary = product.variants?.[0]
  const currency = primary?.price?.currency
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    manufacturer: product.vendor,
    tags: product.tags,
    visible: product.status ? product.status === 'ACTIVE' : undefined,
  }
  if (primary?.sku) body.sku = primary.sku
  if (primary?.price) {
    const taxModel = taxModelOf(primary)
    body.salesPrice = {
      amount: minorToMajor(primary.price.amount, currency),
      currency,
      ...(taxModel ? { taxModel } : {}),
    }
  }
  return body
}

/** Body for `PATCH /products/{productId}/variations/{variationId}`. */
export function untransformVariation(variant: Partial<ProductVariant>): Record<string, unknown> {
  const body: Record<string, unknown> = { sku: variant.sku }
  if (variant.price) {
    const taxModel = taxModelOf(variant)
    body.salesPrice = {
      amount: minorToMajor(variant.price.amount, variant.price.currency),
      currency: variant.price.currency,
      ...(taxModel ? { taxModel } : {}),
    }
  }
  return body
}
