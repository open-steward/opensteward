/**
 * Kibo Commerce Product → canonical Product + ProductVariant.
 *
 * Kibo products live at:
 *   GET /api/commerce/catalog/storefront/products
 *   GET /api/commerce/catalog/storefront/products/{productCode}
 *
 * Key fields:
 *   - `productCode`                  → id
 *   - `content.productName`          → title
 *   - `content.productFullDescription` → description
 *   - `productUsage` / `isActive`    → status
 *   - `price.price` / `price.salePrice` → price / compareAtPrice
 *   - `inventoryInfo.onlineStockAvailable` → stock
 *   - `content.productImages[]`      → images
 *   - `variations[]`                 → variants (configurable products)
 *
 * Variants are nested under `variations` on the parent product.  Each
 * variation has its own `productCode`, `options`, and pricing.
 */

import type { Product, ProductVariant, ProductOption, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Kibo shapes ───────────────────────────────────────────────────────────

export interface RawKiboImage {
  imageUrl?: string
  imageLabel?: string
  imageAltText?: string
  sequence?: number
  [key: string]: unknown
}

export interface RawKiboPrice {
  price?: number
  salePrice?: number
  catalogSalePrice?: number
  [key: string]: unknown
}

export interface RawKiboInventory {
  onlineStockAvailable?: number
  [key: string]: unknown
}

export interface RawKiboContent {
  productName?: string
  productFullDescription?: string
  productShortDescription?: string
  seoFriendlyUrl?: string
  productImages?: RawKiboImage[]
  [key: string]: unknown
}

export interface RawKiboVariationOption {
  attributeFQN?: string
  attributeDetail?: {
    name?: string
    [key: string]: unknown
  }
  value?: unknown
  stringValue?: string
  [key: string]: unknown
}

export interface RawKiboVariation {
  productCode?: string
  options?: RawKiboVariationOption[]
  price?: RawKiboPrice
  inventoryInfo?: RawKiboInventory
  isActive?: boolean
  [key: string]: unknown
}

export interface RawKiboProductOption {
  attributeFQN?: string
  attributeDetail?: {
    name?: string
    [key: string]: unknown
  }
  values?: Array<{
    value?: unknown
    stringValue?: string
    isEnabled?: boolean
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface RawKiboProduct {
  productCode?: string
  content?: RawKiboContent
  price?: RawKiboPrice
  inventoryInfo?: RawKiboInventory
  isActive?: boolean
  productUsage?: string // Standard | Configurable | Component | Bundle
  upc?: string
  productType?: string
  categories?: Array<{ id?: number; categoryCode?: string }>
  options?: RawKiboProductOption[]
  variations?: RawKiboVariation[]
  createDate?: string
  updateDate?: string
  publishState?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(isActive: boolean | undefined, publishState: string | undefined): ProductStatus | undefined {
  if (isActive === false) return 'ARCHIVED'
  if (publishState === 'Draft') return 'DRAFT'
  if (isActive === true) return 'ACTIVE'
  return undefined
}

function mapImages(images: RawKiboImage[] | undefined): Image[] | undefined {
  if (!images || images.length === 0) return undefined
  return images.map((img, idx) => ({
    url: img.imageUrl ?? '',
    alt: img.imageAltText ?? img.imageLabel,
    position: img.sequence ?? idx,
  }))
}

function mapCurrency(_raw: RawKiboProduct): string {
  // Kibo does not always include currency in the product response; default to USD
  return 'USD'
}

function mapVariantOptionValues(
  options: RawKiboVariationOption[] | undefined,
): Record<string, string> | undefined {
  if (!options || options.length === 0) return undefined
  const result: Record<string, string> = {}
  for (const opt of options) {
    const name = opt.attributeDetail?.name ?? opt.attributeFQN ?? 'option'
    const value = opt.stringValue ?? String(opt.value ?? '')
    result[name] = value
  }
  return result
}

function mapProductOptions(opts: RawKiboProductOption[] | undefined): ProductOption[] | undefined {
  if (!opts || opts.length === 0) return undefined
  return opts.map((opt, idx) => ({
    id: opt.attributeFQN,
    name: opt.attributeDetail?.name ?? opt.attributeFQN ?? `option_${idx}`,
    values: (opt.values ?? [])
      .filter((v) => v.isEnabled !== false)
      .map((v) => v.stringValue ?? String(v.value ?? '')),
    position: idx,
  }))
}

// ── Variant transform ─────────────────────────────────────────────────────────

export function transformProductVariant(
  variation: RawKiboVariation,
  parentCode: string,
  currency: string,
): ProductVariant {
  const price = variation.price?.salePrice ?? variation.price?.price ?? 0
  const compareAtPrice = variation.price?.price !== undefined && variation.price.salePrice !== undefined
    ? { amount: majorToMinor(variation.price.price, currency), currency }
    : undefined

  return {
    id: variation.productCode ?? `${parentCode}:variant`,
    productId: parentCode,
    price: { amount: majorToMinor(price, currency), currency },
    compareAtPrice,
    optionValues: mapVariantOptionValues(variation.options),
    metadata: variation as Record<string, unknown>,
  }
}

// ── Product transform ─────────────────────────────────────────────────────────

export function transformProduct(raw: RawKiboProduct): Product {
  const currency = mapCurrency(raw)
  const price = raw.price?.salePrice ?? raw.price?.price ?? 0
  const compareAtPrice =
    raw.price?.price !== undefined && raw.price.salePrice !== undefined
      ? { amount: majorToMinor(raw.price.price, currency), currency }
      : undefined

  const id = raw.productCode ?? ''

  let variants: ProductVariant[] | undefined
  if (raw.variations && raw.variations.length > 0) {
    variants = raw.variations.map((v) => transformProductVariant(v, id, currency))
  } else {
    // Synthesise a default variant for simple (non-configurable) products
    variants = [
      {
        id: `${id}:default`,
        productId: id,
        price: { amount: majorToMinor(price, currency), currency },
        compareAtPrice,
        metadata: {
          synthetic: true,
          reason: 'Kibo product has no separate variations',
          parentProductCode: id,
        },
      },
    ]
  }

  return {
    id,
    title: raw.content?.productName ?? '',
    description: raw.content?.productFullDescription ?? raw.content?.productShortDescription,
    handle: raw.content?.seoFriendlyUrl,
    status: mapStatus(raw.isActive, raw.publishState),
    productType: raw.productType ?? raw.productUsage,
    options: mapProductOptions(raw.options),
    variants,
    images: mapImages(raw.content?.productImages),
    createdAt: raw.createDate,
    updatedAt: raw.updateDate,
    metadata: raw as Record<string, unknown>,
  }
}
