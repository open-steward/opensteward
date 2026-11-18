/**
 * OroCommerce Product → canonical Product.
 *
 * OroCommerce uses a configurable-product model similar to Magento:
 * a parent product has `relationships.variantProducts` linking to child
 * simple products. For simple products without variants, we synthesize
 * a default variant.
 *
 * JSON:API responses are pre-flattened by the client (id + attributes
 * at top level, relationships under `_relationships`).
 *
 * Canonical `Product.id` = Oro product id (numeric, stringified).
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import { toIsoDatetime } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw OroCommerce shapes (post-flatten) ─────────────────────────────────────

export interface RawOroProduct {
  id: string
  sku?: string
  name?: string
  status?: string // enabled | disabled
  type?: string // simple | configurable
  description?: string
  shortDescription?: string
  createdAt?: string
  updatedAt?: string
  productType?: string
  url?: string
  unitPrecisions?: Array<{ unit?: { id?: string }; precision?: number; conversionRate?: number; sell?: boolean }>
  prices?: Array<{ price?: number; currency?: string; quantity?: number; unit?: string }>
  images?: Array<{ id?: string; url?: string; types?: string[]; updatedAt?: string }>
  productAttributes?: Record<string, unknown>
  variantProducts?: Array<{ id: string }>
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawOroProductImage {
  id?: string
  url?: string
  types?: string[]
  updatedAt?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  if (status === 'enabled') return 'ACTIVE'
  if (status === 'disabled') return 'ARCHIVED'
  return 'DRAFT'
}

function mapImages(raw: RawOroProduct): Image[] {
  const imgs = raw.images ?? []
  return imgs
    .filter((img) => img.url)
    .map((img, idx) => ({
      id: img.id != null ? String(img.id) : undefined,
      url: img.url!,
      position: idx,
    }))
}

function extractPrice(raw: RawOroProduct): { amount: number; currency: string } {
  const priceEntry = raw.prices?.[0]
  const currency = priceEntry?.currency ?? 'USD'
  return {
    amount: majorToMinor(priceEntry?.price ?? 0, currency),
    currency,
  }
}

function buildOptions(raw: RawOroProduct): ProductOption[] | undefined {
  const attrs = raw.productAttributes
  if (!attrs || typeof attrs !== 'object') return undefined
  const options: ProductOption[] = []
  let pos = 0
  for (const [name, value] of Object.entries(attrs)) {
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      options.push({ name, values: value, position: pos++ })
    }
  }
  return options.length > 0 ? options : undefined
}

// ── Variant transform ─────────────────────────────────────────────────────────

export function transformProductVariant(
  child: RawOroProduct,
  parentId: string,
): ProductVariant {
  const { amount, currency } = extractPrice(child)
  return {
    id: child.id,
    productId: parentId,
    sku: child.sku,
    title: child.name,
    price: { amount, currency },
    taxable: true,
    requiresShipping: true,
    metadata: {
      ...(child as Record<string, unknown>),
      parentProductId: parentId,
    },
  }
}

// ── Product transform ─────────────────────────────────────────────────────────

export function transformProduct(
  raw: RawOroProduct,
  children?: RawOroProduct[],
): Product {
  const images = mapImages(raw)
  const { amount, currency } = extractPrice(raw)

  let variants: ProductVariant[] = []
  if (children && children.length > 0) {
    variants = children.map((c) => transformProductVariant(c, raw.id))
  } else if (raw.type !== 'configurable') {
    // Synthesize a default variant for simple products
    variants = [
      {
        id: `${raw.id}:default`,
        productId: raw.id,
        sku: raw.sku,
        title: raw.name,
        price: { amount, currency },
        taxable: true,
        requiresShipping: true,
        metadata: {
          synthetic: true,
          reason: `OroCommerce ${raw.type ?? 'simple'} product has no separate variants`,
          parentProductId: raw.id,
        },
      },
    ]
  }

  return {
    id: raw.id,
    title: raw.name ?? '',
    description: raw.description,
    handle: raw.url,
    status: mapStatus(raw.status),
    productType: raw.type ?? raw.productType,
    options: buildOptions(raw),
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ─────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const first = product.variants?.[0]
  return {
    data: {
      type: 'products',
      attributes: {
        sku: product.id ?? first?.sku,
        name: product.title,
        status: product.status === 'ACTIVE' ? 'enabled' : 'disabled',
        description: product.description,
      },
    },
  }
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    data: {
      type: 'products',
      attributes: {
        sku: variant.sku,
        name: variant.title,
        status: 'enabled',
      },
    },
  }
}
