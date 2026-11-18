/**
 * Dooca Commerce Product / Variation / Image → canonical.
 *
 * Dooca returns products with nested variations and images. Key API fields:
 *   - `name` (not `title`)
 *   - `description` (HTML string)
 *   - `url` for slug/handle
 *   - `active` (boolean) → ACTIVE / DRAFT status
 *   - `price` / `price_compare` — decimal major unit strings → minor units
 *   - `images[]` with `url`, `position`, `title`
 *   - `variations[]` with their own `price`, `reference` (SKU), `gtin`, etc.
 *
 * Docs: https://docs.dooca.com.br/produtos/api
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Dooca shapes (minimal) ───────────────────────────────────────────────

export interface RawDoocaProductImage {
  id?: number | string
  url?: string
  title?: string | null
  position?: number
  [key: string]: unknown
}

export interface RawDoocaVariationGrid {
  id?: number | string
  name?: string
  value?: string
  [key: string]: unknown
}

export interface RawDoocaVariation {
  id: number | string
  product_id?: number | string
  reference?: string | null   // SKU
  gtin?: string | null        // barcode
  price?: string | number | null
  price_compare?: string | number | null
  stock?: number | null
  weight?: number | null
  active?: boolean
  position?: number
  grids?: RawDoocaVariationGrid[]
  [key: string]: unknown
}

export interface RawDoocaProduct {
  id: number | string
  name: string
  description?: string | null
  slug?: string | null        // URL-safe slug
  url?: string | null         // full URL (not used for handle)
  active?: boolean
  price?: string | number | null
  price_compare?: string | number | null
  brand?: { id?: number | string; name?: string } | null
  category_default?: { id?: number | string; name?: string } | null
  images?: RawDoocaProductImage[]
  variations?: RawDoocaVariation[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinor(v: string | number | null | undefined, currency: string): number {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return majorToMinor(Number.isFinite(n) ? n : 0, currency)
}

function mapStatus(active: boolean | undefined): ProductStatus | undefined {
  if (active === undefined) return undefined
  return active ? 'ACTIVE' : 'DRAFT'
}

function transformImage(raw: RawDoocaProductImage): Image {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.url ?? '',
    alt: raw.title ?? undefined,
    position: raw.position,
  }
}

function buildOptionValues(
  grids: RawDoocaVariationGrid[] | undefined,
): Record<string, string> | undefined {
  if (!grids || grids.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const g of grids) {
    if (g.name && g.value != null) {
      out[g.name] = String(g.value)
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function transformVariant(
  raw: RawDoocaVariation,
  currency: string = 'BRL',
): ProductVariant {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    sku: raw.reference ?? undefined,
    barcode: raw.gtin ?? undefined,
    price: { amount: toMinor(raw.price, currency), currency },
    compareAtPrice:
      raw.price_compare != null && raw.price_compare !== ''
        ? { amount: toMinor(raw.price_compare, currency), currency }
        : undefined,
    weight: raw.weight ?? undefined,
    weightUnit: 'g',
    optionValues: buildOptionValues(raw.grids),
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawDoocaProduct, currency: string = 'BRL'): Product {
  const variants = (raw.variations ?? []).map((v) => transformVariant(v, currency))
  const images = (raw.images ?? []).map(transformImage)

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.description ?? undefined,
    handle: raw.slug ?? undefined,
    status: mapStatus(raw.active),
    vendor: raw.brand?.name ?? undefined,
    productType: raw.category_default?.name ?? undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Dooca product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    url: product.handle,
    active: product.status == null ? undefined : product.status === 'ACTIVE',
  }
  if (product.images && product.images.length > 0) {
    body['images'] = product.images.map((img, i) => ({
      src: img.url,
      title: img.alt,
      position: img.position ?? i,
    }))
  }
  return body
}

/** Canonical ProductVariant → Dooca variation body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    reference: variant.sku,
    gtin: variant.barcode,
    price: variant.price?.amount != null ? (variant.price.amount / 100).toFixed(2) : undefined,
    price_compare:
      variant.compareAtPrice?.amount != null
        ? (variant.compareAtPrice.amount / 100).toFixed(2)
        : undefined,
    weight: variant.weight,
    active: true,
  }
}
