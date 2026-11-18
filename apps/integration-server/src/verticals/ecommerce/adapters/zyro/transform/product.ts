/**
 * Zyro Product → canonical Product / ProductVariant.
 *
 * Zyro models products with an optional `variants` array. Each variant has a
 * `price` (number), optional `sku`, `stock`, and a map of option values.
 * Product status uses `"published"` → ACTIVE, `"draft"` → DRAFT,
 * `"hidden"` / `"archived"` → ARCHIVED.
 *
 * Money: all prices are plain numbers in the store's default currency. The
 * currency is not embedded in individual product records — it must be
 * supplied from the store configuration or order context.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Zyro shapes ─────────────────────────────────────────────────────────

export interface RawZyroImage {
  id?: string
  src?: string
  url?: string
  alt?: string
  width?: number
  height?: number
  position?: number
  [key: string]: unknown
}

export interface RawZyroProductOption {
  id?: string
  name?: string
  values?: string[]
  position?: number
  [key: string]: unknown
}

export interface RawZyroVariant {
  id?: string
  product_id?: string
  sku?: string
  barcode?: string
  price?: number | string
  compare_at_price?: number | string
  stock?: number
  weight?: number
  weight_unit?: string
  /** Map of option name → selected value. */
  options?: Record<string, string>
  title?: string
  taxable?: boolean
  requires_shipping?: boolean
  position?: number
  [key: string]: unknown
}

export interface RawZyroProduct {
  id?: string
  title?: string
  name?: string
  description?: string
  handle?: string
  slug?: string
  status?: string
  vendor?: string
  product_type?: string
  type?: string
  tags?: string[]
  options?: RawZyroProductOption[]
  variants?: RawZyroVariant[]
  images?: RawZyroImage[]
  price?: number | string
  currency?: string
  created_at?: string
  updated_at?: string
  published_at?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toAmount(v: number | string | null | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return parseFloat(v) || 0
}

function mapStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  const s = status.toLowerCase()
  if (s === 'published' || s === 'active') return 'ACTIVE'
  if (s === 'draft') return 'DRAFT'
  if (s === 'hidden' || s === 'archived' || s === 'inactive') return 'ARCHIVED'
  return undefined
}

function transformImage(raw: RawZyroImage, index: number): Image {
  return {
    id: raw.id,
    url: raw.src ?? raw.url ?? '',
    alt: raw.alt ?? undefined,
    width: raw.width,
    height: raw.height,
    position: raw.position ?? index,
  }
}

function transformOption(raw: RawZyroProductOption): ProductOption {
  return {
    id: raw.id,
    name: raw.name ?? '',
    values: raw.values ?? [],
    position: raw.position,
  }
}

export function transformVariant(
  raw: RawZyroVariant,
  currency: string = 'USD',
): ProductVariant {
  const price = toAmount(raw.price)
  const compareAt = toAmount(raw.compare_at_price ?? undefined)

  // Build a human-readable title from option values if not explicitly set
  let title: string | undefined = raw.title
  if (!title && raw.options && Object.keys(raw.options).length > 0) {
    title = Object.values(raw.options).join(' / ')
  }

  return {
    id: String(raw.id ?? ''),
    productId: raw.product_id ? String(raw.product_id) : undefined,
    sku: raw.sku || undefined,
    barcode: raw.barcode || undefined,
    title,
    price: { amount: majorToMinor(price, currency), currency },
    compareAtPrice:
      compareAt > 0 ? { amount: majorToMinor(compareAt, currency), currency } : undefined,
    weight: raw.weight,
    weightUnit: raw.weight_unit as ProductVariant['weightUnit'],
    optionValues:
      raw.options && Object.keys(raw.options).length > 0 ? raw.options : undefined,
    taxable: raw.taxable,
    requiresShipping: raw.requires_shipping,
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawZyroProduct): Product {
  const currency = raw.currency ?? 'USD'

  const variants = (raw.variants ?? []).map((v) => transformVariant(v, currency))
  const images = (raw.images ?? []).map((img, i) => transformImage(img, i))
  const options = (raw.options ?? []).map(transformOption)

  // Some Zyro responses use `name` instead of `title`
  const title = raw.title ?? raw.name ?? ''
  const handle = raw.handle ?? raw.slug

  return {
    id: String(raw.id ?? ''),
    title,
    description: raw.description || undefined,
    handle,
    status: mapStatus(raw.status),
    vendor: raw.vendor || undefined,
    productType: raw.product_type ?? raw.type ?? undefined,
    tags: raw.tags && raw.tags.length > 0 ? raw.tags : undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
