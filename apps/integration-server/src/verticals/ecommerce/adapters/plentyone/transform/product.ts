/**
 * PlentyONE Item / Variation → canonical Product / ProductVariant.
 *
 * PlentyONE models products as Items with one or more Variations. The main
 * variation (isMain = true) carries the canonical product-level data. Every
 * variation has its own `number` (SKU), prices (via variationSalesPrices),
 * and attribute values (via variationAttributeValues).
 *
 * Endpoints used:
 *   GET /rest/items?with=texts,variations,itemImages
 *   GET /rest/items/{itemId}?with=texts,variations,itemImages
 *   GET /rest/items/{itemId}/variations?with=variationSalesPrices,variationAttributeValues
 */

import type { Product, ProductVariant, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Currency-aware write helper ───────────────────────────────────────────────

const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'PYG', 'UGX', 'RWF',
])
const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR', 'TND', 'JOD', 'IQD', 'LYD'])

/** Convert canonical integer minor units back to major-unit decimal for the upstream API. */
function minorToMajor(amount: number, currency: string): number {
  const c = currency.toUpperCase()
  const exponent = ZERO_DECIMAL_CURRENCIES.has(c) ? 0 : THREE_DECIMAL_CURRENCIES.has(c) ? 3 : 2
  return amount / 10 ** exponent
}

// ── Raw PlentyONE shapes ─────────────────────────────────────────────────────

export interface RawPlentyOneItemText {
  lang: string
  name1?: string | null
  name2?: string | null
  name3?: string | null
  description?: string | null
  urlPath?: string | null
}

export interface RawPlentyOneVariationSalesPrice {
  salesPriceId?: number
  price?: number | null
  currency?: string | null
}

export interface RawPlentyOneVariationAttributeValue {
  attributeId?: number
  valueId?: number
  attribute?: { backendName?: string | null }
  attributeValue?: { backendName?: string | null }
}

export interface RawPlentyOneImage {
  id?: number | string
  url?: string | null
  urlPreview?: string | null
  names?: Array<{ lang?: string; name?: string | null }>
  position?: number
}

export interface RawPlentyOneVariation {
  id: number | string
  itemId?: number | string
  isMain?: boolean
  isActive?: boolean
  number?: string | null
  barcode?: string | null
  weightG?: number | null
  weight?: number | null
  position?: number
  updatedAt?: string
  createdAt?: string
  variationSalesPrices?: RawPlentyOneVariationSalesPrice[]
  variationAttributeValues?: RawPlentyOneVariationAttributeValue[]
  [key: string]: unknown
}

export interface RawPlentyOneItem {
  id: number | string
  mainVariationId?: number | string
  isActive?: boolean
  updatedAt?: string
  createdAt?: string
  texts?: RawPlentyOneItemText[]
  variations?: RawPlentyOneVariation[]
  itemImages?: RawPlentyOneImage[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickText(texts: RawPlentyOneItemText[] | undefined): RawPlentyOneItemText | undefined {
  if (!texts || texts.length === 0) return undefined
  return texts.find((t) => t.lang === 'en') ?? texts[0]
}

function mapStatus(isActive: boolean | undefined): ProductStatus | undefined {
  if (isActive == null) return undefined
  return isActive ? 'ACTIVE' : 'DRAFT'
}

function pickPrice(
  prices: RawPlentyOneVariationSalesPrice[] | undefined,
): { amount: number; currency: string } | undefined {
  if (!prices || prices.length === 0) return undefined
  const p = prices.find((sp) => sp.price != null && sp.price > 0) ?? prices[0]
  if (!p || p.price == null) return undefined
  const currency = p.currency ?? 'EUR'
  return { amount: majorToMinor(p.price, currency), currency }
}

function buildOptionValues(
  attrs: RawPlentyOneVariationAttributeValue[] | undefined,
): Record<string, string> | undefined {
  if (!attrs || attrs.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const av of attrs) {
    const attrName = av.attribute?.backendName ?? String(av.attributeId ?? '')
    const valName = av.attributeValue?.backendName ?? String(av.valueId ?? '')
    if (attrName && valName) out[attrName] = valName
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function mapImage(img: RawPlentyOneImage): Image | undefined {
  const url = img.url ?? img.urlPreview
  if (!url) return undefined
  const altEntry = img.names?.find((n) => n.lang === 'en') ?? img.names?.[0]
  return {
    id: img.id != null ? String(img.id) : undefined,
    url,
    alt: altEntry?.name ?? undefined,
    position: img.position,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformVariation(raw: RawPlentyOneVariation): ProductVariant {
  const price = pickPrice(raw.variationSalesPrices)
  return {
    id: String(raw.id),
    productId: raw.itemId != null ? String(raw.itemId) : undefined,
    sku: raw.number ?? undefined,
    barcode: raw.barcode ?? undefined,
    price: price ?? { amount: 0, currency: 'EUR' },
    weight: raw.weightG ?? raw.weight ?? undefined,
    weightUnit: 'g',
    optionValues: buildOptionValues(raw.variationAttributeValues),
    position: raw.position,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformItem(raw: RawPlentyOneItem): Product {
  const text = pickText(raw.texts)
  const images = (raw.itemImages ?? []).map(mapImage).filter((i): i is Image => !!i)
  const variants = (raw.variations ?? []).map(transformVariation)

  return {
    id: String(raw.id),
    title: text?.name1 ?? text?.name2 ?? text?.name3 ?? '',
    description: text?.description ?? undefined,
    handle: text?.urlPath ?? undefined,
    status: mapStatus(raw.isActive),
    variants: variants.length > 0 ? variants : undefined,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → PlentyONE item body for create/update. */
export function untransformItem(product: Partial<Product>): Record<string, unknown> {
  const texts: RawPlentyOneItemText[] = []
  if (product.title || product.description) {
    texts.push({
      lang: 'en',
      name1: product.title,
      description: product.description,
      urlPath: product.handle,
    })
  }
  return {
    isActive: product.status ? product.status === 'ACTIVE' : undefined,
    texts: texts.length > 0 ? texts : undefined,
  }
}

/** Canonical ProductVariant → PlentyONE variation body for create/update. */
export function untransformVariation(variant: Partial<ProductVariant>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    number: variant.sku,
    weightG: variant.weight,
    isActive: true,
  }
  if (variant.price) {
    body['variationSalesPrices'] = [
      {
        salesPriceId: 1,
        price: minorToMajor(variant.price.amount, variant.price.currency),
        currency: variant.price.currency,
      },
    ]
  }
  return body
}
