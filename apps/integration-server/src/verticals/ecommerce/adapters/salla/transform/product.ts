/**
 * Salla Product → canonical Product / ProductVariant.
 *
 * Salla product structure:
 *  - `id`, `name`, `status` (sale|out|hidden|deleted), `price`, `sale_price`
 *  - `sku`, `quantity`, `description`, `weight`
 *  - `images[]` with id, url, main, alt
 *  - `options[]` with name, display_type, values[]
 *  - `skus[]` — SKU / variant combinations with price, stock_quantity, etc.
 *  - `categories[]` with id, name
 *  - `updated_at` (no created_at on list endpoint)
 *
 * All prices are decimal major units (SAR/etc.). Convert via majorToMinor.
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaPrice {
  amount: number
  currency: string
}

export interface RawSallaImage {
  id?: number | string
  url: string
  main?: boolean
  alt?: string | null
  type?: string
}

export interface RawSallaOptionValue {
  id?: number | string
  name?: string
  price?: RawSallaPrice
}

export interface RawSallaOption {
  id?: number | string
  name: string
  display_type?: string
  values?: RawSallaOptionValue[]
}

/** A SKU / variant combination inside a Salla product. */
export interface RawSallaSku {
  id?: number | string
  price?: RawSallaPrice
  regular_price?: RawSallaPrice
  stock_quantity?: number | null
  unlimited_quantity?: boolean
  barcode?: string | null
  sku?: string | null
  /** IDs of option values that compose this SKU combination. */
  related_option_values?: Array<number | string>
  [key: string]: unknown
}

export interface RawSallaCategory {
  id: number | string
  name?: string
}

export interface RawSallaProduct {
  id: number | string
  name: string
  type?: string
  status?: string
  price?: RawSallaPrice
  sale_price?: RawSallaPrice | null
  cost_price?: number | null
  quantity?: number | null
  unlimited_quantity?: boolean
  sku?: string | null
  description?: string | null
  weight?: number | null
  images?: RawSallaImage[]
  options?: RawSallaOption[]
  skus?: RawSallaSku[]
  categories?: RawSallaCategory[]
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(status: string | undefined): ProductStatus | undefined {
  if (!status) return undefined
  const map: Record<string, ProductStatus> = {
    sale: 'ACTIVE',
    out: 'ACTIVE',
    hidden: 'DRAFT',
    deleted: 'ARCHIVED',
  }
  return map[status.toLowerCase()] ?? undefined
}

function mapImage(raw: RawSallaImage, index: number): Image | undefined {
  if (!raw.url) return undefined
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    url: raw.url,
    alt: raw.alt ?? undefined,
    position: index,
  }
}

function mapMoney(
  price: RawSallaPrice | null | undefined,
): { amount: number; currency: string } | undefined {
  if (!price) return undefined
  return {
    amount: majorToMinor(price.amount, price.currency),
    currency: price.currency,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawSallaProduct): Product {
  const images = (raw.images ?? [])
    .map((img, i) => mapImage(img, i))
    .filter((img): img is Image => img != null)

  const options: ProductOption[] = (raw.options ?? []).map((opt) => ({
    id: opt.id != null ? String(opt.id) : undefined,
    name: opt.name,
    values: (opt.values ?? []).map((v) => v.name ?? String(v.id ?? '')).filter(Boolean),
  }))

  const variants: ProductVariant[] = (raw.skus ?? []).map((sku) =>
    transformVariantFromSku(sku, raw),
  )

  return {
    id: String(raw.id),
    title: raw.name,
    description: raw.description ?? undefined,
    status: mapStatus(raw.status),
    productType: raw.type ?? undefined,
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformVariantFromSku(
  sku: RawSallaSku,
  product: RawSallaProduct,
): ProductVariant {
  const price = sku.price ?? product.price
  const compareAtPrice = sku.regular_price ?? undefined

  return {
    id: sku.id != null ? String(sku.id) : String(product.id),
    productId: String(product.id),
    sku: sku.sku ?? product.sku ?? undefined,
    barcode: sku.barcode ?? undefined,
    price: mapMoney(price) ?? { amount: 0, currency: 'SAR' },
    compareAtPrice: mapMoney(compareAtPrice),
    weight: product.weight ?? undefined,
    weightUnit: 'kg',
    metadata: sku as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Salla product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: product.title,
    description: product.description,
    status: product.status ? mapStatusReverse(product.status) : undefined,
  }
  if (product.variants?.[0]?.price) {
    const p = product.variants[0].price
    body.price = minorToMajor(p.amount, p.currency)
  }
  if (product.images) {
    body.images = product.images.map((img) => ({ url: img.url, alt: img.alt }))
  }
  return body
}

function mapStatusReverse(status: ProductStatus): string {
  const map: Record<ProductStatus, string> = {
    ACTIVE: 'sale',
    DRAFT: 'hidden',
    ARCHIVED: 'deleted',
  }
  return map[status] ?? 'sale'
}

/** Canonical ProductVariant → Salla SKU body (for update). */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  return {
    sku: variant.sku,
    barcode: variant.barcode,
    price: variant.price ? minorToMajor(variant.price.amount, variant.price.currency) : undefined,
  }
}
