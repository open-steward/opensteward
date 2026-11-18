/**
 * StoreHippo `ms.products` record → canonical Product / ProductVariant.
 *
 * Fields, from the ms-products reference
 * (https://help.storehippo.com/api/reference/ms-products):
 *   name        "Name of product."
 *   alias       "Aliases are the unique product URL on storefront." (ex floral-shirt)
 *   description "A brief description of the product."
 *   brand       "Brand is the identity of the product's manufacturer."
 *   publish     "Enabling the flag makes the product visible on storefront." (ex 1)
 *   tags        array
 *   options     "The different properties of a product that are used to define
 *               product variants." ({ name, values })
 *   variants    "variants help to offer choices to customers such as size, color,
 *               material etc." Example entry:
 *               { "price": "300", "compare_price": "350", "sku": "TSHIRT_BLUE",
 *                 "inventory_management": "automatic", "inventory_quantity": 2,
 *                 "options": [ { "name": "color", "value": "blue" } ],
 *                 "variant_id": "blue" }
 * `_id`, `created_on` and `updated_on` are on every record in the documented
 * responses (the API overview's list example and the ms-orders get example).
 *
 * No product field names a currency. Prices are amounts in the store's
 * default currency (ms.currencies: `default` "It stores the default currency
 * of the store."; conversion rates are "with respect to the default
 * currency"), which the adapter reads and passes in.
 *
 * Images are left out: their documented `image` value is a path relative to
 * the response's `fileBaseUrl`, not a URL.
 *
 * The product-level `price` (required, ex 2000), `compare_price` and `sku`
 * have no canonical slot: Product carries prices only on variants, and
 * inventing a variant for a product that documents none would be a
 * synthetic record. They stay in `metadata` (the raw record).
 */

import type { Product, ProductOption, ProductStatus, ProductVariant } from '../../../schema/product'
import { minorToMajor } from '../../../schema/shared'
import { money, recordId, slug, text } from '../values'

// ── Raw StoreHippo shapes (documented fields only) ───────────────────────────

export interface RawStoreHippoVariantOption {
  name?: string
  value?: string
}

export interface RawStoreHippoVariant {
  variant_id?: string
  price?: string | number
  compare_price?: string | number
  sku?: string
  inventory_management?: string
  inventory_quantity?: number
  options?: RawStoreHippoVariantOption[]
  [key: string]: unknown
}

export interface RawStoreHippoProduct {
  _id?: string
  name?: string
  alias?: string
  description?: string
  brand?: string
  publish?: string
  tags?: unknown[]
  options?: Array<{ name?: string; values?: unknown[] }>
  variants?: RawStoreHippoVariant[]
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(publish: unknown): ProductStatus | undefined {
  if (publish === '1') return 'ACTIVE'
  if (publish === '0') return 'DRAFT'
  return undefined
}

function mapOptions(raw: RawStoreHippoProduct['options']): ProductOption[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ProductOption[] = []
  raw.forEach((o, position) => {
    if (typeof o?.name !== 'string' || o.name === '') return
    const values = Array.isArray(o.values)
      ? o.values.filter((v): v is string => typeof v === 'string')
      : []
    out.push({ name: o.name, values, position })
  })
  return out.length > 0 ? out : undefined
}

function optionValues(variant: RawStoreHippoVariant): Record<string, string> | undefined {
  if (!Array.isArray(variant.options)) return undefined
  const out: Record<string, string> = {}
  for (const o of variant.options) {
    if (typeof o?.name === 'string' && typeof o.value === 'string') out[o.name] = o.value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** The canonical variant id: the parent product's `_id` and the variant's `variant_id`. */
export function variantKey(productId: string, variantId: string): string {
  return `${productId}:${variantId}`
}

// ── Transforms ───────────────────────────────────────────────────────────────

/**
 * One entry of a product's `variants` array. `productId` is the parent's
 * `_id`; `currency` is the store's default currency.
 */
export function transformVariant(
  raw: RawStoreHippoVariant,
  productId: string,
  currency: string,
): ProductVariant {
  const variantId = text(raw.variant_id)
  if (!variantId)
    throw new Error(`StoreHippo product ${productId} has a variant without variant_id`)
  const price = money(raw.price, currency)
  if (!price) {
    throw new Error(`StoreHippo variant ${variantId} of product ${productId} has no numeric price`)
  }
  const compareAtPrice = money(raw.compare_price, currency)
  return {
    id: variantKey(productId, variantId),
    productId,
    ...(text(raw.sku) ? { sku: raw.sku } : {}),
    price,
    ...(compareAtPrice ? { compareAtPrice } : {}),
    ...(optionValues(raw) ? { optionValues: optionValues(raw) } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Every variant of one product, in the order the product lists them. */
export function transformVariants(raw: RawStoreHippoProduct, currency: string): ProductVariant[] {
  const productId = recordId(raw, 'product')
  return (raw.variants ?? []).map((v) => transformVariant(v, productId, currency))
}

export function transformProduct(raw: RawStoreHippoProduct, currency: string): Product {
  const id = recordId(raw, 'product')
  const title = text(raw.name)
  if (!title) throw new Error(`StoreHippo product ${id} has no name`)
  const variants = transformVariants(raw, currency)
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string' && t !== '')
    : []
  const status = mapStatus(raw.publish)
  const options = mapOptions(raw.options)
  return {
    id,
    title,
    ...(text(raw.description) ? { description: raw.description } : {}),
    ...(slug(raw.alias) ? { handle: raw.alias } : {}),
    ...(status ? { status } : {}),
    ...(text(raw.brand) ? { vendor: raw.brand } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(options ? { options } : {}),
    ...(variants.length > 0 ? { variants } : {}),
    ...(text(raw.created_on) ? { createdAt: raw.created_on } : {}),
    ...(text(raw.updated_on) ? { updatedAt: raw.updated_on } : {}),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → StoreHippo product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    alias: product.handle,
    description: product.description,
    brand: product.vendor,
    type: product.productType,
    status: product.status === 'ACTIVE' ? 1 : product.status === 'DRAFT' ? 0 : undefined,
  }
  if (product.tags) {
    body['tags'] = product.tags.join(',')
  }
  if (product.variants) {
    body['variants'] = product.variants.map((v) => ({
      sku: v.sku,
      barcode: v.barcode,
      price: v.price?.amount != null ? minorToMajor(v.price.amount, v.price.currency) : undefined,
      mrp:
        v.compareAtPrice?.amount != null
          ? minorToMajor(v.compareAtPrice.amount, v.compareAtPrice.currency)
          : undefined,
      weight: v.weight,
      position: v.position,
    }))
  }
  if (product.images) {
    body['images'] = product.images.map((img) => ({
      path: img.url,
      alt: img.alt,
      position: img.position,
    }))
  }
  return body
}

/** Canonical ProductVariant → StoreHippo variant body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku: variant.sku,
    barcode: variant.barcode,
    price:
      variant.price?.amount != null
        ? minorToMajor(variant.price.amount, variant.price.currency)
        : undefined,
    mrp:
      variant.compareAtPrice?.amount != null
        ? minorToMajor(variant.compareAtPrice.amount, variant.compareAtPrice.currency)
        : undefined,
    weight: variant.weight,
    position: variant.position,
  }
}
