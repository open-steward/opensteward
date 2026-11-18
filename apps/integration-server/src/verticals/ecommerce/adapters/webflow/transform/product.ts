/**
 * Webflow Product / SKU → canonical Product / ProductVariant.
 *
 * Webflow's ecommerce CMS models products and SKUs separately. Each product
 * is a CMS item in the "Products" collection. SKUs are nested within a product
 * and represent purchasable variants.
 *
 * Webflow API v2: GET /sites/{siteId}/products
 */

import type {
  Product,
  ProductVariant,
  ProductOption,
  ProductStatus,
} from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw Webflow shapes ──────────────────────────────────────────────────────

export interface RawWebflowImage {
  url?: string
  alt?: string | null
  fileId?: string
}

export interface RawWebflowSkuField {
  name?: string
  slug?: string
  price?: { value?: number; unit?: string }
  'compare-at-price'?: { value?: number; unit?: string }
  sku?: string
  'main-image'?: RawWebflowImage
  weight?: number
  width?: number
  height?: number
  length?: number
  'sku-values'?: Record<string, string>
  [key: string]: unknown
}

export interface RawWebflowSku {
  id: string
  fieldData?: RawWebflowSkuField
  createdOn?: string
  lastUpdated?: string
  [key: string]: unknown
}

export interface RawWebflowProductField {
  name?: string
  slug?: string
  description?: string
  'product-type'?: string
  category?: string[]
  'main-image'?: RawWebflowImage
  'more-images'?: RawWebflowImage[]
  'sku-properties'?: RawWebflowSkuProperty[]
  'tax-category'?: string
  'default-sku'?: string
  [key: string]: unknown
}

export interface RawWebflowSkuProperty {
  id?: string
  name?: string
  enum?: Array<{ id?: string; name?: string; slug?: string }>
}

export interface RawWebflowProduct {
  id: string
  fieldData?: RawWebflowProductField
  skus?: RawWebflowSku[]
  createdOn?: string
  lastUpdated?: string
  lastPublished?: string | null
  isDraft?: boolean
  isArchived?: boolean
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(raw: RawWebflowProduct): ProductStatus | undefined {
  if (raw.isArchived) return 'ARCHIVED'
  if (raw.isDraft) return 'DRAFT'
  return 'ACTIVE'
}

function mapImage(img: RawWebflowImage | undefined | null): Image | undefined {
  if (!img || !img.url) return undefined
  return {
    id: img.fileId,
    url: img.url,
    alt: img.alt ?? undefined,
  }
}

function mapImages(raw: RawWebflowProduct): Image[] | undefined {
  const images: Image[] = []
  const mainImg = mapImage(raw.fieldData?.['main-image'])
  if (mainImg) images.push({ ...mainImg, position: 0 })
  const more = raw.fieldData?.['more-images'] ?? []
  for (let i = 0; i < more.length; i++) {
    const img = mapImage(more[i])
    if (img) images.push({ ...img, position: i + 1 })
  }
  return images.length > 0 ? images : undefined
}

function mapOptions(skuProps: RawWebflowSkuProperty[] | undefined): ProductOption[] | undefined {
  if (!skuProps || skuProps.length === 0) return undefined
  return skuProps.map((prop, idx) => ({
    id: prop.id,
    name: prop.name ?? 'Option',
    values: (prop.enum ?? []).map((e) => e.name ?? e.slug ?? ''),
    position: idx + 1,
  }))
}

/**
 * Build canonical optionValues by resolving Webflow's sku-values map
 * (property id → enum id) against the product's sku-properties definitions.
 */
function buildOptionValues(
  skuValues: Record<string, string> | undefined,
  skuProps: RawWebflowSkuProperty[] | undefined,
): Record<string, string> | undefined {
  if (!skuValues || !skuProps) return undefined
  const out: Record<string, string> = {}
  for (const prop of skuProps) {
    if (!prop.id || !prop.name) continue
    const enumId = skuValues[prop.id]
    if (!enumId) continue
    const enumEntry = (prop.enum ?? []).find((e) => e.id === enumId)
    if (enumEntry?.name) out[prop.name] = enumEntry.name
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Webflow prices are in integer minor units (cents); canonical Money is too. */
function centsToAmount(cents: number | undefined): number {
  if (cents == null) return 0
  return Math.round(cents)
}

function getCurrency(sku: RawWebflowSkuField | undefined): string {
  return sku?.price?.unit ?? 'USD'
}

export function transformVariant(
  raw: RawWebflowSku,
  productId?: string,
  skuProps?: RawWebflowSkuProperty[],
): ProductVariant {
  const f = raw.fieldData ?? {}
  const currency = getCurrency(f)
  const compareAt = f['compare-at-price']
  return {
    id: raw.id,
    productId,
    sku: f.sku || undefined,
    title: f.name,
    price: { amount: centsToAmount(f.price?.value), currency },
    compareAtPrice:
      compareAt?.value != null && compareAt.value > 0
        ? { amount: centsToAmount(compareAt.value), currency }
        : undefined,
    weight: f.weight,
    optionValues: buildOptionValues(f['sku-values'], skuProps),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawWebflowProduct): Product {
  const f = raw.fieldData ?? {}
  const skuProps = f['sku-properties']
  const variants = (raw.skus ?? []).map((s) =>
    transformVariant(s, raw.id, skuProps),
  )
  return {
    id: raw.id,
    title: f.name ?? '',
    description: f.description,
    handle: f.slug,
    status: mapStatus(raw),
    productType: f['product-type'],
    tags: f.category,
    options: mapOptions(skuProps),
    variants: variants.length > 0 ? variants : undefined,
    images: mapImages(raw),
    createdAt: raw.createdOn,
    updatedAt: raw.lastUpdated,
    publishedAt: raw.lastPublished ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Webflow product body (for create/update). */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const fieldData: Record<string, unknown> = {}
  if (product.title != null) fieldData.name = product.title
  if (product.description != null) fieldData.description = product.description
  if (product.handle != null) fieldData.slug = product.handle
  if (product.productType != null) fieldData['product-type'] = product.productType
  if (product.tags != null) fieldData.category = product.tags

  const body: Record<string, unknown> = { fieldData }
  if (product.status === 'DRAFT') body.isDraft = true
  if (product.status === 'ARCHIVED') body.isArchived = true
  return body
}

/** Canonical ProductVariant → Webflow SKU body. */
export function untransformVariant(variant: Partial<ProductVariant>): Record<string, unknown> {
  const fieldData: Record<string, unknown> = {}
  if (variant.title != null) fieldData.name = variant.title
  if (variant.sku != null) fieldData.sku = variant.sku
  if (variant.price != null) {
    fieldData.price = {
      // Canonical Money and Webflow prices are both integer minor units (cents).
      value: Math.round(variant.price.amount),
      unit: variant.price.currency,
    }
  }
  if (variant.compareAtPrice != null) {
    fieldData['compare-at-price'] = {
      value: Math.round(variant.compareAtPrice.amount),
      unit: variant.compareAtPrice.currency,
    }
  }
  if (variant.weight != null) fieldData.weight = variant.weight
  return { fieldData }
}
