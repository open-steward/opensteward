/**
 * Aimeos Product → canonical Product.
 *
 * Aimeos exposes products via JSON:API at `GET /api/product`. Attributes use
 * dot-notation keys within the JSON:API `attributes` envelope:
 *
 *   product.id           — numeric/string id (also in `id`)
 *   product.label        — display name
 *   product.code         — SKU / article number
 *   product.status       — int: -2=archived, -1=review, 0=disabled, 1=enabled
 *   product.type         — "default" | "bundle" | "select" | "voucher"
 *   product.url          — URL slug
 *   product.config       — JSON blob of additional config
 *   product.datestart    — ISO date or null
 *   product.dateend      — ISO date or null
 *   product.ctime        — creation ISO datetime
 *   product.mtime        — modification ISO datetime
 *
 * Variants (sub-products of type "select") are separate `product` resources
 * linked via `product/product` relationship with type "default".
 *
 * Prices live in a separate `/api/price` resource with domain "product".
 * When included, they appear under `relationships.product/price`.
 */

import type { Product, ProductVariant } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import type { AimeosResource } from '../client'
import { AIMEOS_STATUS } from '../constants'

// ── Raw Aimeos shapes ─────────────────────────────────────────────────────────

export interface AimeosProductAttributes {
  'product.id'?: string | number
  'product.label'?: string
  'product.code'?: string
  'product.status'?: number
  'product.type'?: string
  'product.url'?: string
  'product.description'?: string
  'product.datestart'?: string | null
  'product.dateend'?: string | null
  'product.ctime'?: string | null
  'product.mtime'?: string | null
  'product.config'?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface AimeosPriceAttributes {
  'price.value'?: string | number
  'price.currencyid'?: string
  'price.quantity'?: number
  'price.costs'?: string | number
  'price.rebate'?: string | number
  'price.domain'?: string
  [key: string]: unknown
}

export interface AimeosMediaAttributes {
  'media.url'?: string
  'media.label'?: string
  'media.width'?: number
  'media.height'?: number
  'media.position'?: number
  'media.domain'?: string
  [key: string]: unknown
}

export type AimeosProduct = AimeosResource & {
  attributes: AimeosProductAttributes
}

export type AimeosPrice = AimeosResource & {
  attributes: AimeosPriceAttributes
}

export type AimeosMedia = AimeosResource & {
  attributes: AimeosMediaAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(status: number | undefined): 'ACTIVE' | 'ARCHIVED' | 'DRAFT' {
  if (status === AIMEOS_STATUS.ENABLED) return 'ACTIVE'
  if (status === AIMEOS_STATUS.ARCHIVED) return 'ARCHIVED'
  return 'DRAFT'
}

function parsePrice(
  priceAttrs: AimeosPriceAttributes,
): { amount: number; currency: string } {
  const amount = parseFloat(String(priceAttrs['price.value'] ?? '0')) || 0
  const currency = priceAttrs['price.currencyid'] ?? 'USD'
  return { amount: majorToMinor(amount, currency), currency }
}

function relationshipIds(resource: AimeosResource, field: string): string[] {
  const rel = resource.relationships?.[field]
  if (!rel) return []
  if (Array.isArray(rel.data)) return rel.data.map((d) => d.id)
  if (rel.data && !Array.isArray(rel.data)) return [rel.data.id]
  return []
}

function mapImages(mediaList: AimeosMedia[]): Image[] | undefined {
  if (!mediaList || mediaList.length === 0) return undefined
  return mediaList.map((m, idx) => ({
    id: m.id,
    url: m.attributes['media.url'] ?? '',
    alt: m.attributes['media.label'] as string | undefined,
    width: m.attributes['media.width'] as number | undefined,
    height: m.attributes['media.height'] as number | undefined,
    position: (m.attributes['media.position'] as number | undefined) ?? idx,
  }))
}

// ── Variant transform ─────────────────────────────────────────────────────────

export function transformVariant(
  raw: AimeosProduct,
  priceResource?: AimeosPrice,
  parentId?: string,
): ProductVariant {
  const attrs = raw.attributes
  const fallbackPrice = { amount: 0, currency: 'USD' }
  const price = priceResource ? parsePrice(priceResource.attributes) : fallbackPrice

  return {
    id: raw.id,
    productId: parentId,
    sku: attrs['product.code'] as string | undefined,
    title: attrs['product.label'] as string | undefined,
    price,
    requiresShipping: true,
    taxable: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Product transform ─────────────────────────────────────────────────────────

export function transformProduct(
  raw: AimeosProduct,
  includedPrices?: AimeosPrice[],
  includedMedia?: AimeosMedia[],
  includedVariants?: AimeosProduct[],
): Product {
  const attrs = raw.attributes
  const status = mapStatus(attrs['product.status'] as number | undefined)

  // Price: first included price for this product
  const primaryPrice =
    includedPrices && includedPrices.length > 0
      ? parsePrice(includedPrices[0]!.attributes)
      : undefined

  const images = includedMedia ? mapImages(includedMedia) : undefined

  // Variants: sub-products linked via relationship
  const variantRelIds = relationshipIds(raw, 'product/product')
  const variants: ProductVariant[] | undefined =
    includedVariants && includedVariants.length > 0
      ? includedVariants.map((v) => transformVariant(v, undefined, raw.id))
      : variantRelIds.length > 0
        ? variantRelIds.map((vid) => ({
            id: vid,
            productId: raw.id,
            price: primaryPrice ?? { amount: 0, currency: 'USD' },
            metadata: { synthetic: true, reason: 'variant not included in response' },
          }))
        : undefined

  return {
    id: raw.id,
    title: (attrs['product.label'] as string | undefined) ?? '',
    description: attrs['product.description'] as string | undefined,
    handle: attrs['product.url'] as string | undefined,
    status,
    productType: attrs['product.type'] as string | undefined,
    images,
    variants,
    createdAt: attrs['product.ctime'] as string | undefined,
    updatedAt: attrs['product.mtime'] as string | undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ────────────────────────────────────────

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  let status: number | undefined
  if (product.status === 'ACTIVE') status = AIMEOS_STATUS.ENABLED
  else if (product.status === 'DRAFT') status = AIMEOS_STATUS.DISABLED
  else if (product.status === 'ARCHIVED') status = AIMEOS_STATUS.ARCHIVED

  const attributes: Record<string, unknown> = {}
  if (product.title != null) attributes['product.label'] = product.title
  if (product.handle != null) attributes['product.url'] = product.handle
  if (product.description != null) attributes['product.description'] = product.description
  if (status != null) attributes['product.status'] = status
  if (product.productType != null) attributes['product.type'] = product.productType

  return {
    data: {
      type: 'product',
      attributes,
    },
  }
}
