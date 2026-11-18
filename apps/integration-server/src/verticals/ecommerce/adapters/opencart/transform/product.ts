/**
 * OpenCart Product → canonical Product / ProductVariant.
 *
 * OpenCart products have a flat structure with options modelled as
 * separate entities. Products can have "options" (e.g. size, color)
 * that function like Shopify variants. Stock is tracked per product
 * (or per option value in some configurations).
 *
 * Key mappings:
 *  - `product_id` → `id` (stringified)
 *  - `model` → `sku`
 *  - `status` 1/0 → ACTIVE/DRAFT
 *  - `price` is a string/number
 *  - `quantity` → stock quantity
 *  - `image` → primary image URL
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw OpenCart shapes ─────────────────────────────────────────────────────

export interface RawOpenCartProductImage {
  product_image_id?: number | string
  image?: string
  sort_order?: number | string
}

export interface RawOpenCartProductOption {
  product_option_id?: number | string
  option_id?: number | string
  name: string
  type?: string
  option_value?: RawOpenCartProductOptionValue[]
}

export interface RawOpenCartProductOptionValue {
  product_option_value_id?: number | string
  option_value_id?: number | string
  name: string
  quantity?: number | string
  price?: string | number
  price_prefix?: string
}

export interface RawOpenCartProduct {
  product_id: number | string
  name: string
  model?: string
  sku?: string
  slug?: string
  description?: string
  meta_description?: string
  tag?: string
  price?: string | number
  special?: string | number | null
  quantity?: number | string
  status?: number | string
  image?: string
  images?: RawOpenCartProductImage[]
  manufacturer_id?: number | string
  manufacturer?: string
  categories?: Array<{ category_id: number | string; name: string }>
  options?: RawOpenCartProductOption[]
  weight?: string | number | null
  weight_class_id?: number | string
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(s: number | string | undefined): ProductStatus | undefined {
  if (s == null) return undefined
  const n = typeof s === 'string' ? parseInt(s, 10) : s
  return n === 1 ? 'ACTIVE' : 'DRAFT'
}

function toAssetUrl(raw: string): string {
  // Already absolute (http(s)://...) or root-relative — pass through
  if (/^https?:\/\//.test(raw) || raw.startsWith('/')) return raw
  // OpenCart's `catalog/product/...` paths live under the storefront's
  // /image/ prefix; prepend `/` so the canonical schema accepts the value.
  return `/${raw}`
}

function transformImage(raw: RawOpenCartProductImage, siteBase?: string): Image {
  const url = raw.image
    ? (siteBase ? `${siteBase}/image/${raw.image}` : toAssetUrl(raw.image))
    : ''
  return {
    id: raw.product_image_id != null ? String(raw.product_image_id) : undefined,
    url,
    position: raw.sort_order != null ? Number(raw.sort_order) : undefined,
  }
}

function transformOption(raw: RawOpenCartProductOption): ProductOption {
  return {
    id: raw.product_option_id != null ? String(raw.product_option_id) : undefined,
    name: raw.name,
    values: (raw.option_value ?? []).map((v) => v.name),
    position: undefined,
  }
}

/**
 * Build a synthetic variant for a simple product (no options).
 */
function buildDefaultVariant(
  raw: RawOpenCartProduct,
  productId: string,
  currency: string,
): ProductVariant {
  return {
    id: `${productId}:default`,
    productId,
    sku: raw.model ?? raw.sku ?? undefined,
    price: { amount: majorToMinor(toNum(raw.price), currency), currency },
    compareAtPrice:
      raw.special != null && raw.special !== ''
        ? { amount: majorToMinor(toNum(raw.price), currency), currency }
        : undefined,
    weight: raw.weight != null ? toNum(raw.weight) : undefined,
    weightUnit: raw.weight != null ? 'g' : undefined,
    inventoryItemId: productId,
    metadata: {
      synthetic: true,
      reason: 'OpenCart product with no options',
      parentProductId: productId,
    },
  }
}

/**
 * Build variants from OpenCart product options. Each option value
 * combination is treated as a variant.
 */
function buildOptionVariants(
  raw: RawOpenCartProduct,
  productId: string,
  currency: string,
): ProductVariant[] {
  const options = raw.options ?? []
  if (options.length === 0) return []

  const variants: ProductVariant[] = []
  // For simplicity, treat each option value as a variant (first option).
  const firstOption = options[0]
  if (!firstOption?.option_value) return []

  for (const ov of firstOption.option_value) {
    const variantId = ov.product_option_value_id != null
      ? String(ov.product_option_value_id)
      : ov.name
    const basePrice = toNum(raw.price)
    const optionPrice = toNum(ov.price)
    const prefix = ov.price_prefix ?? '+'
    const effectivePrice = prefix === '-' ? basePrice - optionPrice : basePrice + optionPrice

    variants.push({
      id: `${productId}:${variantId}`,
      productId,
      sku: raw.model ? `${raw.model}-${ov.name}` : undefined,
      title: ov.name,
      price: { amount: majorToMinor(effectivePrice, currency), currency },
      inventoryItemId: String(variantId),
      optionValues: { [firstOption.name]: ov.name },
      metadata: {
        parentProductId: productId,
        optionValueId: ov.option_value_id,
      },
    })
  }

  return variants
}

export function transformProduct(
  raw: RawOpenCartProduct,
  currency: string = 'USD',
): Product {
  const productId = String(raw.product_id)

  // Primary image
  const images: Image[] = []
  if (raw.image) {
    images.push({ url: toAssetUrl(raw.image), position: 0 })
  }
  if (raw.images) {
    images.push(...raw.images.map((img) => transformImage(img)))
  }

  const options = (raw.options ?? []).map(transformOption)
  const variants = buildOptionVariants(raw, productId, currency)
  if (variants.length === 0) {
    variants.push(buildDefaultVariant(raw, productId, currency))
  }

  const tags = raw.tag
    ? raw.tag.split(',').map((t) => t.trim()).filter(Boolean)
    : undefined

  const productType =
    raw.categories && raw.categories.length > 0 ? raw.categories[0]!.name : undefined

  return {
    id: productId,
    title: raw.name,
    description: raw.description,
    handle: toSlug(raw.slug),
    status: mapStatus(raw.status),
    productType,
    tags: tags && tags.length > 0 ? tags : undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.date_added),
    updatedAt: toIsoDatetime(raw.date_modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformProductVariant(
  raw: RawOpenCartProductOptionValue,
  productId: string,
  optionName: string,
  basePrice: number = 0,
  currency: string = 'USD',
): ProductVariant {
  const variantId = raw.product_option_value_id != null
    ? String(raw.product_option_value_id)
    : raw.name
  const optionPrice = toNum(raw.price)
  const prefix = raw.price_prefix ?? '+'
  const effectivePrice = prefix === '-' ? basePrice - optionPrice : basePrice + optionPrice

  return {
    id: `${productId}:${variantId}`,
    productId,
    title: raw.name,
    price: { amount: majorToMinor(effectivePrice, currency), currency },
    inventoryItemId: String(variantId),
    optionValues: { [optionName]: raw.name },
    metadata: {
      parentProductId: productId,
      optionValueId: raw.option_value_id,
    },
  }
}

/** Canonical Product → OpenCart product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    status: product.status === 'ACTIVE' ? 1 : product.status === 'DRAFT' ? 0 : undefined,
  }
  if (product.tags) {
    body['tag'] = product.tags.join(', ')
  }
  if (product.images && product.images.length > 0) {
    body['image'] = product.images[0]!.url
  }
  // Simple-product pricing
  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.price?.amount != null) body['price'] = v.price.amount
    if (v.sku) body['model'] = v.sku
  }
  return body
}

/** Canonical ProductVariant → OpenCart option value body. */
export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    name: variant.title,
    price: variant.price?.amount,
    quantity: undefined,
  }
}
