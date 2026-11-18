/**
 * Commerce Layer SKU → canonical Product.
 *
 * Commerce Layer uses **SKUs** as the product concept. Each SKU is an
 * independently purchasable item with a code, name, description, and
 * image_url. Pricing is handled separately via **Prices** resources
 * (linked through price lists), but SKUs carry no inline price.
 *
 * Since Commerce Layer has no parent-child product model, each SKU maps
 * to both a Product AND a synthesized default variant.
 *
 * JSON:API responses are pre-flattened by the client (id + attributes
 * at top level, relationships under `_relationships`).
 */

import type { Product, ProductVariant } from '../../../schema/product'
import {  toIsoDatetime , toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'

// ── Raw Commerce Layer shapes (post-flatten) ─────────────────────────────────

export interface RawCLSku {
  id: string
  code?: string
  name?: string
  description?: string
  image_url?: string
  weight?: number
  unit_of_weight?: string // g, kg, oz, lb
  pieces_per_pack?: number
  hs_tariff_number?: string
  do_not_ship?: boolean
  do_not_track?: boolean
  created_at?: string
  updated_at?: string
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapWeightUnit(unit: string | undefined): 'g' | 'kg' | 'oz' | 'lb' | undefined {
  if (!unit) return undefined
  const u = unit.toLowerCase()
  if (u === 'g' || u === 'gr' || u === 'grams') return 'g'
  if (u === 'kg' || u === 'kilograms') return 'kg'
  if (u === 'oz' || u === 'ounces') return 'oz'
  if (u === 'lb' || u === 'lbs' || u === 'pounds') return 'lb'
  return undefined
}

function mapImages(raw: RawCLSku): Image[] | undefined {
  if (!raw.image_url) return undefined
  return [{ url: raw.image_url, position: 0 }]
}

// ── Variant transform ────────────────────────────────────────────────────────

export function transformProductVariant(raw: RawCLSku): ProductVariant {
  return {
    id: `${raw.id}:default`,
    productId: raw.id,
    sku: raw.code,
    title: raw.name,
    price: { amount: 0, currency: 'USD' },
    weight: raw.weight,
    weightUnit: mapWeightUnit(raw.unit_of_weight),
    taxable: true,
    requiresShipping: raw.do_not_ship !== true,
    metadata: {
      ...(raw as Record<string, unknown>),
      synthetic: true,
      reason: 'Commerce Layer SKUs have no parent-child variant model; each SKU is a single variant',
    },
  }
}

// ── Product transform ────────────────────────────────────────────────────────

export function transformProduct(raw: RawCLSku): Product {
  return {
    id: raw.id,
    title: raw.name ?? '',
    description: raw.description,
    handle: toSlug(raw.code),
    status: 'ACTIVE',
    variants: [transformProductVariant(raw)],
    images: mapImages(raw),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const firstVariant = product.variants?.[0]
  return {
    data: {
      type: 'skus',
      attributes: {
        code: firstVariant?.sku ?? product.handle ?? product.id,
        name: product.title,
        description: product.description,
        image_url: product.images?.[0]?.url,
        weight: firstVariant?.weight,
        unit_of_weight: firstVariant?.weightUnit,
        do_not_ship: firstVariant?.requiresShipping === false,
      },
    },
  }
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    data: {
      type: 'skus',
      attributes: {
        code: variant.sku,
        name: variant.title,
        weight: variant.weight,
        unit_of_weight: variant.weightUnit,
        do_not_ship: variant.requiresShipping === false,
      },
    },
  }
}
