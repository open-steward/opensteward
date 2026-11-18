/**
 * Spryker abstract-product / concrete-product → canonical Product / ProductVariant.
 *
 * Spryker separates products into two tiers:
 *  - abstract-products: the parent record (name, description, images).
 *    Identified by `sku` (the abstract SKU, e.g. "001").
 *  - concrete-products: SKU-level child records (stock, concrete attributes).
 *    Identified by their own `sku` (e.g. "001_25904006").
 *
 * We map abstract-products → canonical Product, with concrete-products as
 * variants. Prices from the `abstract-product-prices` relationship include are
 * used when the caller requests them.
 *
 * Spryker Glue REST API JSON:API response shape:
 *   {
 *     data: {
 *       type: "abstract-products",
 *       id: "001",
 *       attributes: { sku, name, description, attributes, superAttributesDefinition, ... }
 *     }
 *   }
 *
 * Prices (abstract-product-prices include) are integer minor-unit amounts
 * (cents). Concrete-product prices are similarly minor-unit when included.
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import type { JsonApiResource } from '../client'

// ── Raw Spryker shapes ────────────────────────────────────────────────────────

export interface RawSprykerAbstractProductAttributes {
  sku: string
  name: string
  description?: string | null
  attributes?: Record<string, string | null>
  attributeNames?: Record<string, string>
  superAttributesDefinition?: string[]
  taxRate?: number | null
  newFrom?: string | null
  newTo?: string | null
  metaTitle?: string | null
  metaKeywords?: string | null
  metaDescription?: string | null
  url?: string | null
  [key: string]: unknown
}

export interface RawSprykerConcreteProductAttributes {
  sku: string
  name?: string | null
  description?: string | null
  productAbstractSku?: string | null
  isDiscontinued?: boolean
  discontinuedNote?: string | null
  averageRating?: number | null
  reviewCount?: number | null
  attributes?: Record<string, string | null>
  attributeNames?: Record<string, string>
  [key: string]: unknown
}

/** Price from the abstract-product-prices include. */
export interface RawSprykerPrice {
  priceTypeName: string // "DEFAULT" | "ORIGINAL"
  grossAmount?: number | null
  netAmount?: number | null
  currency?: {
    code?: string
    name?: string
    symbol?: string
  }
}

export interface RawSprykerAbstractProductPricesAttributes {
  price?: number | null
  prices?: RawSprykerPrice[]
  currency?: { code?: string }
}

/** Image set from abstract-product-image-sets include. */
export interface RawSprykerImageSetAttributes {
  imageSets?: Array<{
    name?: string
    images?: Array<{
      externalUrlSmall?: string
      externalUrlLarge?: string
    }>
  }>
}

export type RawSprykerAbstractProduct = JsonApiResource<RawSprykerAbstractProductAttributes>
export type RawSprykerConcreteProduct = JsonApiResource<RawSprykerConcreteProductAttributes>
export type RawSprykerPriceResource = JsonApiResource<RawSprykerAbstractProductPricesAttributes>
export type RawSprykerImageSetResource = JsonApiResource<RawSprykerImageSetAttributes>

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDefaultPrice(
  priceAttrs: RawSprykerAbstractProductPricesAttributes | undefined,
  fallbackCurrency: string,
): { amount: number; currency: string } | undefined {
  if (!priceAttrs) return undefined
  const prices = priceAttrs.prices ?? []
  const cur = priceAttrs.currency?.code ?? fallbackCurrency
  const def = prices.find((p) => p.priceTypeName === 'DEFAULT')
  const amount = def?.grossAmount ?? priceAttrs.price
  if (amount == null) return undefined
  // Spryker Glue already returns integer minor-unit amounts.
  return { amount, currency: cur }
}

function extractImages(imageAttrs: RawSprykerImageSetAttributes | undefined): Image[] | undefined {
  const sets = imageAttrs?.imageSets ?? []
  if (sets.length === 0) return undefined
  const out: Image[] = []
  for (const set of sets) {
    for (let i = 0; i < (set.images ?? []).length; i++) {
      const img = set.images![i]!
      const url = img.externalUrlLarge ?? img.externalUrlSmall
      if (url) out.push({ url, position: out.length })
    }
  }
  return out.length > 0 ? out : undefined
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Transform a Spryker abstract-product JSON:API resource into a canonical
 * Product. Optionally accepts related concrete-products (variants) and
 * include resources for prices and image sets.
 */
export function transformAbstractProduct(
  raw: RawSprykerAbstractProduct,
  concretes: RawSprykerConcreteProduct[] = [],
  priceResource?: RawSprykerPriceResource,
  imageResource?: RawSprykerImageSetResource,
  currency = 'EUR',
): Product {
  const attrs = raw.attributes
  const priceAttrs = priceResource?.attributes
  const price = extractDefaultPrice(priceAttrs, currency)
  const images = extractImages(imageResource?.attributes)
  const effectiveCurrency = price?.currency ?? currency

  const variants =
    concretes.length > 0
      ? concretes.map((c) => transformConcreteProduct(c, raw.id, effectiveCurrency))
      : undefined

  const options =
    attrs.superAttributesDefinition && attrs.superAttributesDefinition.length > 0
      ? attrs.superAttributesDefinition.map((name) => ({
          name,
          values: [],
        }))
      : undefined

  return {
    id: raw.id,
    title: attrs.name,
    description: attrs.description ?? undefined,
    handle: attrs.url ?? undefined,
    status: 'ACTIVE' as ProductStatus,
    tags: undefined,
    options,
    variants,
    images,
    createdAt: undefined,
    updatedAt: undefined,
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a Spryker concrete-product JSON:API resource into a canonical
 * ProductVariant.
 */
export function transformConcreteProduct(
  raw: RawSprykerConcreteProduct,
  productId?: string,
  currency = 'EUR',
): ProductVariant {
  const attrs = raw.attributes
  return {
    id: raw.id,
    productId: productId ?? attrs.productAbstractSku ?? undefined,
    sku: attrs.sku,
    title: attrs.name ?? undefined,
    price: { amount: 0, currency },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Spryker abstract-product create/update body. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    data: {
      type: 'abstract-products',
      attributes: {
        name: product.title,
        description: product.description,
        sku: product.handle ?? product.id,
      },
    },
  }
}
