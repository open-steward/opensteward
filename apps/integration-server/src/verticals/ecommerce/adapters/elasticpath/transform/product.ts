/**
 * Elastic Path PCM Product → canonical Product.
 *
 * Elastic Path PCM products use a composable model where the product
 * attributes are nested directly under `data` (not `data.attributes`
 * like standard JSON:API). Key fields:
 *
 *  - `attributes.name` → title
 *  - `attributes.description` → description
 *  - `attributes.slug` → handle
 *  - `attributes.sku` → first variant SKU
 *  - `attributes.status` → 'live' | 'draft'
 *  - `attributes.commodity_type` → 'physical' | 'digital'
 *
 * Pricing is managed separately via price books. PCM product responses
 * do not include inline prices. Canonical `price` defaults to 0.
 *
 * Variants are modeled as child products linked to a base product.
 * The client fetches children via `GET /pcm/products/{id}/children`.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import { toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'

// ── Raw Elastic Path shapes ──────────────────────────────────────────────────

export interface RawEpProductAttributes {
  name?: string
  description?: string
  slug?: string
  sku?: string
  status?: string // live | draft
  commodity_type?: string // physical | digital
  upc_ean?: string
  mpn?: string
  external_ref?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawEpProduct {
  id: string
  type: string // product
  attributes: RawEpProductAttributes
  relationships?: Record<string, unknown>
  meta?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawEpMainImage {
  id?: string
  link?: { href?: string }
  file_name?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  if (status === 'live') return 'ACTIVE'
  if (status === 'draft') return 'DRAFT'
  return 'DRAFT'
}

function mapImages(raw: RawEpProduct): Image[] {
  const mainImage = raw.relationships?.['main_image'] as { data?: { id?: string } } | undefined
  const images: Image[] = []
  if (mainImage?.data?.id) {
    images.push({
      id: mainImage.data.id,
      // Resolving the actual URL requires a separate /files/<id> fetch; emit
      // a placeholder root-relative path so the canonical schema accepts the
      // value and consumers can detect the unresolved state.
      url: `/files/${mainImage.data.id}`,
      position: 0,
    })
  }
  return images
}

function buildOptions(raw: RawEpProduct): ProductOption[] | undefined {
  const variations = raw.relationships?.['variations'] as
    | { data?: Array<{ id: string; type?: string }> }
    | undefined
  if (!variations?.data || variations.data.length === 0) return undefined
  return variations.data.map((v, idx) => ({
    id: v.id,
    name: v.id, // Variation name requires a separate lookup
    values: [],
    position: idx,
  }))
}

// ── Variant transform ────────────────────────────────────────────────────────

export function transformProductVariant(
  child: RawEpProduct,
  parentId: string,
): ProductVariant {
  const attrs = child.attributes
  return {
    id: child.id,
    productId: parentId,
    sku: attrs.sku,
    title: attrs.name,
    price: { amount: 0, currency: 'USD' },
    taxable: attrs.commodity_type === 'physical',
    requiresShipping: attrs.commodity_type === 'physical',
    metadata: {
      ...(child as Record<string, unknown>),
      parentProductId: parentId,
    },
  }
}

// ── Product transform ────────────────────────────────────────────────────────

export function transformProduct(
  raw: RawEpProduct,
  children?: RawEpProduct[],
): Product {
  const attrs = raw.attributes
  const images = mapImages(raw)

  let variants: ProductVariant[] = []
  if (children && children.length > 0) {
    variants = children.map((c) => transformProductVariant(c, raw.id))
  } else {
    // Synthesize a default variant for products without children
    variants = [
      {
        id: `${raw.id}:default`,
        productId: raw.id,
        sku: attrs.sku,
        title: attrs.name,
        price: { amount: 0, currency: 'USD' },
        taxable: attrs.commodity_type === 'physical',
        requiresShipping: attrs.commodity_type === 'physical',
        metadata: {
          synthetic: true,
          reason: 'Elastic Path PCM product has no separate child variants',
          parentProductId: raw.id,
        },
      },
    ]
  }

  return {
    id: raw.id,
    title: attrs.name ?? '',
    description: attrs.description,
    handle: toSlug(attrs.slug),
    status: mapStatus(attrs.status),
    productType: attrs.commodity_type,
    options: buildOptions(raw),
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: attrs.created_at,
    updatedAt: attrs.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  return {
    data: {
      type: 'product',
      attributes: {
        name: product.title,
        description: product.description,
        slug: product.handle,
        sku: product.variants?.[0]?.sku ?? product.id,
        status: product.status === 'ACTIVE' ? 'live' : 'draft',
        commodity_type: 'physical',
      },
    },
  }
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    data: {
      type: 'product',
      attributes: {
        name: variant.title,
        sku: variant.sku,
        status: 'live',
        commodity_type: 'physical',
      },
    },
  }
}
