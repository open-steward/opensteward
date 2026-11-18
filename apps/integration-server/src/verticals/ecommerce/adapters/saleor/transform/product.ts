/**
 * Saleor Product → canonical Product.
 *
 * Fields per docs.saleor.io/api-reference/products/objects/product. Saleor
 * products carry their variants as a plain list (`variants: [ProductVariant!]`)
 * whose storefront `pricing` is channel-scoped and nullable, so a variant is
 * only mapped when Saleor priced it: the canonical variant price is required,
 * and the currency comes from the price itself, never a default.
 *
 * Product has no publication flag of its own (`isPublished` is not a field;
 * publication lives on the MANAGE_PRODUCTS-gated `channelListings`), so
 * `status` is left unset.
 */

import type { Product, ProductOption, ProductVariant } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { transformVariant, type RawSaleorVariant } from './variant'

// ── Raw Saleor shapes ───────────────────────────────────────────────────────

export interface RawSaleorProductImage {
  id?: string
  /** ProductMedia.url is `String!`. */
  url: string
  alt?: string | null
}

export interface RawSaleorAttribute {
  attribute?: { id?: string; name?: string; slug?: string }
  /** AttributeValue.name is a nullable `String` ("Name of a value displayed in the interface."). */
  values?: Array<{ id?: string; name?: string | null; slug?: string | null }>
}

export interface RawSaleorProductType {
  id?: string
  name?: string
}

export interface RawSaleorProduct {
  id: string
  name: string
  description?: string | null
  slug?: string
  productType?: RawSaleorProductType | null
  category?: { id?: string; name?: string } | null
  attributes?: RawSaleorAttribute[]
  variants?: RawSaleorVariant[]
  media?: RawSaleorProductImage[]
  created?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapImage(raw: RawSaleorProductImage): Image {
  return {
    id: raw.id,
    url: raw.url,
    alt: raw.alt ?? undefined,
  }
}

function mapOptions(attrs: RawSaleorAttribute[] | undefined): ProductOption[] | undefined {
  if (!attrs || attrs.length === 0) return undefined
  const opts: ProductOption[] = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]!
    if (!attr.attribute?.name) continue
    opts.push({
      id: attr.attribute.id,
      name: attr.attribute.name,
      values: (attr.values ?? []).flatMap((v) => (v.name ? [v.name] : [])),
      position: i + 1,
    })
  }
  return opts.length > 0 ? opts : undefined
}

/**
 * Saleor sometimes returns description as a JSON string (rich-text editor
 * format). We pass it through as-is since the canonical field accepts
 * arbitrary strings.
 */
function parseDescription(desc: string | null | undefined): string | undefined {
  if (!desc) return undefined
  // If the description is a JSON object, extract the text content
  try {
    const parsed = JSON.parse(desc)
    if (parsed && typeof parsed === 'object' && 'blocks' in parsed) {
      return desc // keep JSON string as-is — canonical accepts HTML/text
    }
  } catch {
    // Not JSON — plain text or HTML
  }
  return desc
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawSaleorProduct): Product {
  const variants: ProductVariant[] = []
  for (const v of raw.variants ?? []) {
    // VariantPricingInfo.price is a nullable TaxedMoney; its gross is Money!.
    const gross = v.pricing?.price?.gross
    if (!gross) continue
    variants.push(transformVariant(v, gross.currency))
  }
  const images = (raw.media ?? []).map(mapImage)
  const options = mapOptions(raw.attributes)

  return {
    id: raw.id,
    title: raw.name,
    description: parseDescription(raw.description),
    handle: raw.slug,
    productType: raw.productType?.name ?? undefined,
    options,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: raw.created,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  if (product.title != null) input['name'] = product.title
  if (product.description != null) input['description'] = product.description
  if (product.handle != null) input['slug'] = product.handle
  if (product.status != null) input['isPublished'] = product.status === 'ACTIVE'
  return input
}
