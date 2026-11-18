/**
 * Solidus Product -> canonical Product + ProductVariant.
 *
 * Solidus products share the same shape as Spree (forked from Spree).
 * Key differences:
 *  - `make_active_at` may appear instead of / alongside `available_on`
 *  - Solidus uses `discontinue_on` the same way
 *  - `status` field may be absent in older Solidus versions; fallback
 *    to `available_on` presence for ACTIVE / DRAFT inference.
 *  - Master variant is always present and is the "default" variant.
 *
 * Platform API: `/api/v2/platform/products`
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

// -- Raw Solidus shapes -------------------------------------------------------

export interface RawSolidusOptionValue {
  id?: number | string
  name?: string
  presentation?: string
  option_type_name?: string
  option_type_id?: number | string
  position?: number
}

export interface RawSolidusOptionType {
  id?: number | string
  name?: string
  presentation?: string
  position?: number
  option_values?: RawSolidusOptionValue[]
}

export interface RawSolidusImage {
  id?: number | string
  position?: number
  alt?: string | null
  original_url?: string
  small_url?: string
  product_url?: string
  large_url?: string
  [key: string]: unknown
}

export interface RawSolidusVariant {
  id: number | string
  sku?: string
  price?: string | number
  compare_at_price?: string | number
  cost_price?: string | number
  currency?: string
  weight?: string | number
  height?: string | number
  width?: string | number
  depth?: string | number
  is_master?: boolean
  position?: number
  track_inventory?: boolean
  tax_category_id?: number | string | null
  option_values?: RawSolidusOptionValue[]
  barcode?: string | null
  product_id?: number | string
  total_on_hand?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawSolidusProduct {
  id: number | string
  name: string
  description?: string | null
  slug?: string
  status?: string // 'active' | 'draft' | 'archived'
  available_on?: string | null
  make_active_at?: string | null
  discontinue_on?: string | null
  price?: string | number
  compare_at_price?: string | number
  currency?: string
  meta_title?: string | null
  meta_description?: string | null
  meta_keywords?: string | null
  created_at?: string
  updated_at?: string
  master_variant?: RawSolidusVariant
  variants?: RawSolidusVariant[]
  option_types?: RawSolidusOptionType[]
  images?: RawSolidusImage[]
  taxons?: Array<{ id?: number | string; name?: string }>
  [key: string]: unknown
}

// -- Helpers ------------------------------------------------------------------

function mapStatus(raw: RawSolidusProduct): ProductStatus | undefined {
  if (raw.status) {
    switch (raw.status) {
      case 'active':
        return 'ACTIVE'
      case 'draft':
        return 'DRAFT'
      case 'archived':
        return 'ARCHIVED'
      default:
        return undefined
    }
  }
  // Solidus fallback: infer from available_on
  if (raw.available_on) return 'ACTIVE'
  return 'DRAFT'
}

function reverseStatus(status: ProductStatus | undefined): string | undefined {
  switch (status) {
    case 'ACTIVE':
      return 'active'
    case 'DRAFT':
      return 'draft'
    case 'ARCHIVED':
      return 'archived'
    default:
      return undefined
  }
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

/** Parse a Spree/Solidus decimal-string major value to integer minor units. */
function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapImages(images: RawSolidusImage[] | undefined): Image[] {
  if (!images || images.length === 0) return []
  return images.map((img) => ({
    id: img.id != null ? String(img.id) : undefined,
    url: img.original_url ?? img.large_url ?? img.product_url ?? '',
    alt: img.alt ?? undefined,
    position: img.position,
  }))
}

function buildOptions(optionTypes: RawSolidusOptionType[] | undefined): ProductOption[] | undefined {
  if (!optionTypes || optionTypes.length === 0) return undefined
  return optionTypes.map((ot, idx) => ({
    id: ot.id != null ? String(ot.id) : undefined,
    name: ot.presentation ?? ot.name ?? `option_${idx}`,
    values: (ot.option_values ?? []).map(
      (ov) => ov.presentation ?? ov.name ?? String(ov.id ?? ''),
    ),
    position: ot.position ?? idx,
  }))
}

function buildVariantOptionValues(
  optionValues: RawSolidusOptionValue[] | undefined,
): Record<string, string> | undefined {
  if (!optionValues || optionValues.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const ov of optionValues) {
    const key = ov.option_type_name ?? String(ov.option_type_id ?? 'option')
    out[key] = ov.presentation ?? ov.name ?? String(ov.id ?? '')
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// -- Variant transform --------------------------------------------------------

export function transformProductVariant(
  raw: RawSolidusVariant,
  productId?: string,
  currency: string = 'USD',
): ProductVariant {
  const variantCurrency = raw.currency ?? currency
  const weight = raw.weight != null ? toNum(raw.weight) : undefined
  return {
    id: String(raw.id),
    productId: productId ?? (raw.product_id != null ? String(raw.product_id) : undefined),
    sku: raw.sku ?? undefined,
    barcode: raw.barcode ?? undefined,
    title: raw.sku ?? `Variant ${raw.id}`,
    price: { amount: toMinor(raw.price, variantCurrency), currency: variantCurrency },
    compareAtPrice:
      raw.compare_at_price != null && toNum(raw.compare_at_price) > 0
        ? { amount: toMinor(raw.compare_at_price, variantCurrency), currency: variantCurrency }
        : undefined,
    weight,
    weightUnit: weight != null ? 'g' : undefined,
    optionValues: buildVariantOptionValues(raw.option_values),
    taxable: raw.tax_category_id != null,
    requiresShipping: true,
    position: raw.position,
    metadata: raw as Record<string, unknown>,
  }
}

// -- Product transform --------------------------------------------------------

export function transformProduct(
  raw: RawSolidusProduct,
  variants?: RawSolidusVariant[],
  currency: string = 'USD',
): Product {
  const productId = String(raw.id)
  const productCurrency = raw.currency ?? currency
  const images = mapImages(raw.images)
  const options = buildOptions(raw.option_types)

  // Build variants from provided array or inline variants (excluding master)
  let mappedVariants: ProductVariant[] = []
  const variantList = variants ?? raw.variants ?? []
  const nonMasterVariants = variantList.filter((v) => !v.is_master)

  if (nonMasterVariants.length > 0) {
    mappedVariants = nonMasterVariants.map((v) =>
      transformProductVariant(v, productId, productCurrency),
    )
  } else {
    // Synthesise a default variant from the master/product-level price
    const master = raw.master_variant ?? variantList.find((v) => v.is_master)
    mappedVariants = [
      {
        id: master ? String(master.id) : `${productId}:default`,
        productId,
        sku: master?.sku ?? undefined,
        title: raw.name,
        price: { amount: toMinor(master?.price ?? raw.price, productCurrency), currency: productCurrency },
        taxable: true,
        requiresShipping: true,
        metadata: {
          synthetic: !master,
          reason: 'Solidus product with no non-master variants',
          ...(master ? (master as Record<string, unknown>) : {}),
        },
      },
    ]
  }

  // Solidus may use make_active_at instead of available_on
  const publishedAt = raw.available_on ?? raw.make_active_at ?? undefined

  return {
    id: productId,
    title: raw.name,
    description: raw.description ?? undefined,
    handle: toSlug(raw.slug),
    status: mapStatus(raw),
    options,
    variants: mappedVariants.length > 0 ? mappedVariants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    publishedAt,
    metadata: raw as Record<string, unknown>,
  }
}

// -- Untransform (for create / update) ----------------------------------------

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const firstVariant = product.variants?.[0]
  return {
    product: {
      name: product.title,
      description: product.description,
      slug: product.handle,
      status: reverseStatus(product.status),
      price: firstVariant?.price?.amount,
      available_on: product.publishedAt,
    },
  }
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  return {
    variant: {
      sku: variant.sku,
      price: variant.price?.amount,
      compare_at_price: variant.compareAtPrice?.amount,
      weight: variant.weight,
      barcode: variant.barcode,
    },
  }
}
