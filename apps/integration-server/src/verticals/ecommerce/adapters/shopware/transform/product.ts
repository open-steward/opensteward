/**
 * Shopware 6 Product → canonical Product + ProductVariant.
 *
 * Shopware 6 products are the parent entity. Variants exist as
 * children linked via `parentId`. Each variant has `options` (e.g.
 * color/size) resolved through `propertyGroup` associations.
 *
 * Canonical `Product.id` uses Shopware's UUID. Variant ids use the
 * child product UUID directly.
 *
 * Product fields:
 *  - `active: true/false` → ACTIVE / DRAFT
 *  - `name` — translated, primary from root.
 *  - `productNumber` — the SKU.
 *  - `price[0].gross` — retail price.
 *  - `cover.media.url` — main image.
 *  - `media[]` — all product media.
 *  - `categories[]` — linked category UUIDs.
 *  - `children[]` — variant products (when association loaded).
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

// ── Raw Shopware shapes ────────────────────────────────────────────────────

export interface RawShopwarePrice {
  currencyId?: string
  net?: number
  gross?: number
  linked?: boolean
  listPrice?: { gross?: number; net?: number } | null
}

export interface RawShopwareMedia {
  id?: string
  url?: string
  alt?: string
  title?: string
  position?: number
  media?: { url?: string; alt?: string; title?: string }
}

export interface RawShopwarePropertyGroupOption {
  id?: string
  name?: string
  group?: { id?: string; name?: string }
  groupId?: string
}

export interface RawShopwareCategory {
  id: string
  name?: string
}

export interface RawShopwareProduct {
  id: string
  parentId?: string | null
  productNumber?: string
  name?: string
  description?: string | null
  active?: boolean
  price?: RawShopwarePrice[]
  stock?: number
  availableStock?: number
  weight?: number | null
  ean?: string | null
  manufacturer?: { id?: string; name?: string } | null
  cover?: RawShopwareMedia | null
  media?: RawShopwareMedia[]
  categories?: RawShopwareCategory[]
  children?: RawShopwareProduct[]
  options?: RawShopwarePropertyGroupOption[]
  properties?: RawShopwarePropertyGroupOption[]
  configuratorSettings?: Array<{
    id?: string
    optionId?: string
    option?: RawShopwarePropertyGroupOption
  }>
  tags?: Array<{ id?: string; name?: string }>
  createdAt?: string
  updatedAt?: string | null
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mapStatus(active: boolean | undefined): ProductStatus | undefined {
  if (active == null) return undefined
  return active ? 'ACTIVE' : 'DRAFT'
}

function extractCurrency(_price: RawShopwarePrice[] | undefined): string {
  // Shopware stores currency as a UUID; we default to EUR since
  // Shopware is German-first. The full currency object would need
  // an association load. Callers can check metadata for currencyId.
  return 'EUR'
}

function extractPrice(price: RawShopwarePrice[] | undefined): number {
  if (!price || price.length === 0) return 0
  return price[0]!.gross ?? price[0]!.net ?? 0
}

function extractCompareAtPrice(
  price: RawShopwarePrice[] | undefined,
): number | undefined {
  if (!price || price.length === 0) return undefined
  const listPrice = price[0]!.listPrice
  if (!listPrice) return undefined
  return listPrice.gross ?? listPrice.net ?? undefined
}

function mapImages(raw: RawShopwareProduct): Image[] {
  const mediaEntries = raw.media ?? []
  const images: Image[] = []
  for (const entry of mediaEntries) {
    const url = entry.media?.url ?? entry.url
    if (!url) continue
    images.push({
      id: entry.id,
      url,
      alt: entry.media?.alt ?? entry.alt ?? undefined,
      position: entry.position,
    })
  }
  // If no media but cover exists, use cover
  if (images.length === 0 && raw.cover) {
    const coverUrl = raw.cover.media?.url ?? raw.cover.url
    if (coverUrl) {
      images.push({
        id: raw.cover.id,
        url: coverUrl,
        alt: raw.cover.media?.alt ?? raw.cover.alt ?? undefined,
        position: 0,
      })
    }
  }
  return images
}

function buildOptions(raw: RawShopwareProduct): ProductOption[] | undefined {
  const settings = raw.configuratorSettings
  if (!settings || settings.length === 0) return undefined

  // Group options by their property group
  const groups = new Map<string, { name: string; values: string[] }>()
  for (const setting of settings) {
    const opt = setting.option
    if (!opt) continue
    const groupName = opt.group?.name ?? opt.groupId ?? 'Option'
    const groupId = opt.group?.id ?? opt.groupId ?? 'unknown'
    if (!groups.has(groupId)) {
      groups.set(groupId, { name: groupName, values: [] })
    }
    if (opt.name) {
      groups.get(groupId)!.values.push(opt.name)
    }
  }

  let position = 0
  return Array.from(groups.entries()).map(([id, g]) => ({
    id,
    name: g.name,
    values: g.values,
    position: position++,
  }))
}

function buildVariantOptionValues(
  raw: RawShopwareProduct,
): Record<string, string> | undefined {
  const opts = raw.options
  if (!opts || opts.length === 0) return undefined

  const out: Record<string, string> = {}
  for (const opt of opts) {
    const groupName = opt.group?.name ?? opt.groupId ?? 'Option'
    if (opt.name) {
      out[groupName] = opt.name
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// ── Variant transform ──────────────────────────────────────────────────────

export function transformProductVariant(
  child: RawShopwareProduct,
  parentId: string,
): ProductVariant {
  const currency = extractCurrency(child.price)
  const price = extractPrice(child.price)
  const compareAt = extractCompareAtPrice(child.price)
  return {
    id: child.id,
    productId: parentId,
    sku: child.productNumber,
    barcode: child.ean ?? undefined,
    title: child.name ?? undefined,
    price: { amount: majorToMinor(price, currency), currency },
    compareAtPrice:
      compareAt != null ? { amount: majorToMinor(compareAt, currency), currency } : undefined,
    weight: child.weight ?? undefined,
    weightUnit: child.weight != null ? 'g' : undefined,
    inventoryItemId: child.id,
    optionValues: buildVariantOptionValues(child),
    taxable: true,
    requiresShipping: true,
    metadata: child as Record<string, unknown>,
  }
}

// ── Product transform ──────────────────────────────────────────────────────

export function transformProduct(raw: RawShopwareProduct): Product {
  const currency = extractCurrency(raw.price)
  const images = mapImages(raw)
  const options = buildOptions(raw)
  const tags = raw.tags?.map((t) => t.name).filter((n): n is string => !!n)

  let variants: ProductVariant[] = []
  if (raw.children && raw.children.length > 0) {
    variants = raw.children.map((c) => transformProductVariant(c, raw.id))
  } else if (!raw.parentId) {
    // Synthesise a single default variant for simple products
    variants = [
      {
        id: `${raw.id}:default`,
        productId: raw.id,
        sku: raw.productNumber,
        barcode: raw.ean ?? undefined,
        title: raw.name ?? undefined,
        price: { amount: majorToMinor(extractPrice(raw.price), currency), currency },
        weight: raw.weight ?? undefined,
        weightUnit: raw.weight != null ? 'g' : undefined,
        inventoryItemId: raw.id,
        taxable: true,
        requiresShipping: true,
        metadata: {
          synthetic: true,
          reason: 'Shopware product has no child variants',
        },
      },
    ]
  }

  return {
    id: raw.id,
    title: raw.name ?? '',
    description: raw.description ?? undefined,
    handle: toSlug(raw.productNumber),
    status: mapStatus(raw.active),
    vendor: raw.manufacturer?.name ?? undefined,
    productType: raw.parentId ? 'variant' : 'product',
    tags: tags && tags.length > 0 ? tags : undefined,
    options,
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (for create / update) ──────────────────────────────────────

export function untransformProduct(
  product: Partial<Product>,
): Record<string, unknown> {
  const first = product.variants?.[0]
  const body: Record<string, unknown> = {
    name: product.title,
    productNumber: product.handle ?? first?.sku,
    description: product.description,
    active: product.status === 'ACTIVE' ? true : product.status === 'DRAFT' || product.status === 'ARCHIVED' ? false : undefined,
    stock: 0,
  }
  if (first?.price) {
    body['price'] = [
      {
        gross: first.price.amount,
        net: first.price.amount,
        linked: true,
        currencyId: undefined, // Must be provided by caller or default currency
      },
    ]
  }
  if (first?.weight != null) {
    body['weight'] = first.weight
  }
  return body
}

export function untransformProductVariant(
  variant: Partial<ProductVariant>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    productNumber: variant.sku,
    name: variant.title,
    stock: 0,
  }
  if (variant.price) {
    body['price'] = [
      {
        gross: variant.price.amount,
        net: variant.price.amount,
        linked: true,
      },
    ]
  }
  if (variant.weight != null) {
    body['weight'] = variant.weight
  }
  return body
}
