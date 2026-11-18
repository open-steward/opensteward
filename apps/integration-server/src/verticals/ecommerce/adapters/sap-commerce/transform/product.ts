/**
 * SAP Commerce Cloud Product → canonical Product.
 *
 * The OCC API returns products with a rich structure:
 *  - `code` as the product identifier (not numeric id)
 *  - `name`, `summary`, `description` as plain strings (locale resolved by server)
 *  - `price` as `{currencyIso, value, formattedValue}`
 *  - `images[]` grouped by `imageType` (PRIMARY, GALLERY) and `format`
 *  - `categories[]` for product-category membership
 *  - `stock` for inventory info
 *  - `variantOptions[]` or `baseOptions[]` for variant data
 *  - `classifications[]` for product attributes
 *
 * SAP Commerce supports complex promotions and tiered pricing.
 * The adapter flattens these into the canonical schema and preserves
 * full detail under `metadata`.
 */

import type { Product, ProductOption, ProductVariant } from '../../../schema/product'
import { toIsoDatetime, toSlug } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawSapPrice {
  currencyIso?: string
  value?: number
  formattedValue?: string
  priceType?: string
  minQuantity?: number
  maxQuantity?: number
}

export interface RawSapImage {
  url?: string
  altText?: string
  format?: string
  imageType?: string
  galleryIndex?: number
}

export interface RawSapCategory {
  code?: string
  name?: string
  url?: string
}

export interface RawSapStock {
  stockLevel?: number
  stockLevelStatus?: string
  isValueRounded?: boolean
}

export interface RawSapClassificationFeature {
  code?: string
  name?: string
  featureValues?: Array<{ value?: string }>
}

export interface RawSapClassification {
  code?: string
  name?: string
  features?: RawSapClassificationFeature[]
}

export interface RawSapVariantOption {
  code?: string
  url?: string
  priceData?: RawSapPrice
  stock?: RawSapStock
  variantOptionQualifiers?: Array<{
    qualifier?: string
    name?: string
    value?: string
    image?: RawSapImage
  }>
}

export interface RawSapBaseOption {
  variantType?: string
  options?: RawSapVariantOption[]
  selected?: RawSapVariantOption
}

export interface RawSapProduct {
  code: string
  name?: string
  summary?: string
  description?: string
  url?: string
  slug?: string
  price?: RawSapPrice
  images?: RawSapImage[]
  categories?: RawSapCategory[]
  stock?: RawSapStock
  purchasable?: boolean
  averageRating?: number
  numberOfReviews?: number
  manufacturer?: string
  productType?: string
  classifications?: RawSapClassification[]
  variantOptions?: RawSapVariantOption[]
  baseOptions?: RawSapBaseOption[]
  variantType?: string
  baseProduct?: string
  multidimensional?: boolean
  configurable?: boolean
  tags?: string[]
  availableForPickup?: boolean
  potentialPromotions?: unknown[]
  volumePrices?: RawSapPrice[]
  volumePricesFlag?: boolean
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapImages(images: RawSapImage[] | undefined): Image[] {
  if (!images || images.length === 0) return []
  // SAP images come in multiple formats (thumbnail, product, zoom, etc.)
  // Pick one per gallery index, preferring 'product' format.
  const byIndex = new Map<number, RawSapImage>()
  for (const img of images) {
    const idx = img.galleryIndex ?? 0
    const existing = byIndex.get(idx)
    if (
      !existing ||
      img.format === 'product' ||
      (img.imageType === 'PRIMARY' && existing.imageType !== 'PRIMARY')
    ) {
      byIndex.set(idx, img)
    }
  }
  return Array.from(byIndex.values())
    .filter((img) => img.url)
    .map((img, i) => ({
      url: img.url!,
      alt: img.altText,
      position: i + 1,
    }))
}

function mapProductStatus(
  raw: RawSapProduct,
): 'ACTIVE' | 'ARCHIVED' | 'DRAFT' {
  if (raw.purchasable === false) return 'ARCHIVED'
  if (raw.stock?.stockLevelStatus === 'outOfStock') return 'ARCHIVED'
  return 'ACTIVE'
}

function mapOptions(
  raw: RawSapProduct,
): ProductOption[] {
  const options: ProductOption[] = []
  // Extract from variantOptions qualifiers
  const qualMap = new Map<string, Set<string>>()
  const allVariantOpts = [
    ...(raw.variantOptions ?? []),
    ...(raw.baseOptions?.flatMap((bo) => bo.options ?? []) ?? []),
  ]
  for (const vo of allVariantOpts) {
    for (const q of vo.variantOptionQualifiers ?? []) {
      if (!q.qualifier || !q.value) continue
      const existing = qualMap.get(q.qualifier)
      if (existing) {
        existing.add(q.value)
      } else {
        qualMap.set(q.qualifier, new Set([q.value]))
      }
    }
  }
  let pos = 1
  for (const [name, values] of qualMap) {
    options.push({
      name,
      values: Array.from(values),
      position: pos++,
    })
  }
  return options
}

function mapVariants(raw: RawSapProduct): ProductVariant[] {
  const allVariantOpts = [
    ...(raw.variantOptions ?? []),
    ...(raw.baseOptions?.flatMap((bo) => bo.options ?? []) ?? []),
  ]
  return allVariantOpts
    .filter((vo) => vo.code)
    .map((vo, idx) => {
      const optionValues: Record<string, string> = {}
      for (const q of vo.variantOptionQualifiers ?? []) {
        if (q.qualifier && q.value) {
          optionValues[q.qualifier] = q.value
        }
      }
      return {
        id: vo.code!,
        productId: raw.code,
        sku: vo.code,
        title: vo.code,
        price: {
          amount: majorToMinor(vo.priceData?.value ?? 0, vo.priceData?.currencyIso ?? 'USD'),
          currency: vo.priceData?.currencyIso ?? 'USD',
        },
        optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
        position: idx + 1,
        metadata: vo as unknown as Record<string, unknown>,
      }
    })
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformProduct(raw: RawSapProduct): Product {
  const options = mapOptions(raw)
  const variants = mapVariants(raw)

  return {
    id: raw.code,
    title: raw.name ?? raw.code,
    description: raw.description ?? raw.summary,
    handle: toSlug(raw.url?.replace(/^\//, '') ?? raw.slug),
    status: mapProductStatus(raw),
    vendor: raw.manufacturer,
    productType: raw.productType,
    tags: raw.categories?.map((c) => c.name ?? c.code ?? '').filter(Boolean),
    options: options.length > 0 ? options : undefined,
    variants: variants.length > 0 ? variants : undefined,
    images: mapImages(raw.images),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.modifiedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → SAP Commerce ProductWsDTO body for creation.
 * SAP Commerce typically manages products through Backoffice/ImpEx;
 * the OCC API has limited write support. This builds a minimal body.
 */
export function untransformProduct(
  product: Partial<Product>,
): Record<string, unknown> {
  return {
    code: product.id,
    name: product.title,
    description: product.description,
    manufacturer: product.vendor,
  }
}

/**
 * Build a PATCH body for product updates. SAP Commerce OCC uses
 * standard PATCH semantics (not actions-based like commercetools).
 */
export function buildPatchForProduct(
  updates: Partial<Product>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (updates.title !== undefined) body['name'] = updates.title
  if (updates.description !== undefined) body['description'] = updates.description
  if (updates.vendor !== undefined) body['manufacturer'] = updates.vendor
  return body
}
