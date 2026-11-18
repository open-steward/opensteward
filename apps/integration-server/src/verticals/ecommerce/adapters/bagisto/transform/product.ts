/**
 * Bagisto Product → canonical Product / ProductVariant.
 *
 * Bagisto exposes products with an embedded `variants[]` array for
 * configurable (variable) products. Simple products have no variants array.
 * For simple products, a single synthetic variant is created from the
 * product itself so downstream code can always iterate `product.variants`.
 *
 * Key shapes:
 *  - `status`: 1 = enabled/active, 0 = disabled/draft
 *  - `price`: string-encoded float e.g. "29.99"
 *  - `type`: "simple" | "configurable" | "virtual" | "downloadable" | "grouped" | "bundle"
 *  - `images`: array of `{ url }` objects
 *  - `categories`: array of `{ id, name, ... }`
 *  - `variants[]`: array of variant objects (configurable products only)
 */

import type { Product, ProductVariant, ProductOption } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Bagisto shapes ────────────────────────────────────────────────────────

export interface BagistoProductImage {
  id?: number | string
  url?: string
  path?: string
  original_image_url?: string
  [key: string]: unknown
}

export interface BagistoProductCategory {
  id?: number | string
  name?: string
  slug?: string
  [key: string]: unknown
}

export interface BagistoProductAttribute {
  id?: number | string
  code?: string
  label?: string
  type?: string
  options?: Array<{ id?: number | string; label?: string; [key: string]: unknown }>
  value?: string | number | null
  [key: string]: unknown
}

export interface BagistoProductVariant {
  id: number | string
  sku?: string | null
  name?: string | null
  price?: string | number
  weight?: string | number | null
  status?: number | boolean
  inventories?: Array<{ quantity?: number; [key: string]: unknown }>
  super_attributes?: Record<string, string>
  [key: string]: unknown
}

export interface BagistoProduct {
  id: number | string
  sku?: string | null
  name: string
  slug?: string | null
  price?: string | number
  status?: number | boolean
  type?: string
  description?: string | null
  short_description?: string | null
  weight?: string | number | null
  created_at?: string | null
  updated_at?: string | null
  images?: BagistoProductImage[]
  categories?: BagistoProductCategory[]
  variants?: BagistoProductVariant[]
  super_attributes?: BagistoProductAttribute[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function toFloat(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapStatus(s: number | boolean | undefined): 'ACTIVE' | 'DRAFT' {
  if (s === 1 || s === true) return 'ACTIVE'
  return 'DRAFT'
}

function transformImage(raw: BagistoProductImage): Image {
  const url = raw.url ?? raw.original_image_url ?? raw.path ?? ''
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url,
  }
}

function transformSuperAttribute(raw: BagistoProductAttribute): ProductOption {
  const values: string[] = (raw.options ?? [])
    .map((o) => o.label ?? '')
    .filter((v) => v !== '')
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.label ?? raw.code ?? 'Option',
    values,
  }
}

export function transformProductVariant(
  raw: BagistoProductVariant,
  productId: string,
  currency = 'USD',
): ProductVariant {
  // Bagisto variants can have an `inventories` array — sum quantities.
  const qty =
    (raw.inventories ?? []).reduce((sum, inv) => sum + (inv.quantity ?? 0), 0) || undefined

  // super_attributes is a flat Record<attributeLabel, selectedValue>
  const optionValues =
    raw.super_attributes && Object.keys(raw.super_attributes).length > 0
      ? raw.super_attributes
      : undefined

  return {
    id: `${productId}:${raw.id}`,
    productId,
    sku: raw.sku ?? undefined,
    title: raw.name ?? undefined,
    price: { amount: majorToMinor(toFloat(raw.price), currency), currency },
    weight: raw.weight != null ? toFloat(raw.weight) : undefined,
    weightUnit: raw.weight != null ? 'kg' : undefined,
    inventoryItemId: String(raw.id),
    optionValues,
    taxable: true,
    metadata: {
      ...(raw as Record<string, unknown>),
      parentProductId: productId,
      computedAvailableQty: qty,
    },
  }
}

export function transformProduct(raw: BagistoProduct, currency = 'USD'): Product {
  const productId = String(raw.id)
  const images = (raw.images ?? []).map(transformImage)
  const options = (raw.super_attributes ?? []).map(transformSuperAttribute)
  const firstCategory =
    raw.categories && raw.categories.length > 0 ? raw.categories[0]!.name : undefined

  // Configurable products have an explicit variants array.
  let variants: ProductVariant[] = (raw.variants ?? []).map((v) =>
    transformProductVariant(v, productId, currency),
  )

  // Simple products (and other non-configurable types with no variants):
  // synthesise a single default variant from the product.
  if (variants.length === 0) {
    variants = [
      {
        id: `${productId}:default`,
        productId,
        sku: raw.sku ?? undefined,
        price: { amount: majorToMinor(toFloat(raw.price), currency), currency },
        weight: raw.weight != null ? toFloat(raw.weight) : undefined,
        weightUnit: raw.weight != null ? 'kg' : undefined,
        inventoryItemId: productId,
        metadata: {
          synthetic: true,
          reason: 'Bagisto simple product mapped to a single canonical variant',
          parentProductId: productId,
        },
      },
    ]
  }

  return {
    id: productId,
    title: raw.name,
    description: raw.description ?? raw.short_description ?? undefined,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw.status),
    productType: firstCategory,
    options: options.length > 0 ? options : undefined,
    variants,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Product → Bagisto product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    slug: product.handle,
    status: product.status === 'ACTIVE' ? 1 : 0,
  }

  if (product.variants && product.variants.length === 1) {
    const v = product.variants[0]!
    if (v.sku) body['sku'] = v.sku
    // Canonical price is integer minor units; Bagisto expects a decimal major-unit string.
    if (v.price?.amount != null) body['price'] = (v.price.amount / 100).toFixed(2)
    if (v.weight != null) body['weight'] = v.weight
  }

  return body
}
