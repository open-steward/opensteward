/**
 * Shift4Shop Product → canonical Product / ProductVariant.
 *
 * Shift4Shop products live under `/Products`. Each product carries a
 * `SKUInfo` array of stock-keeping variants (options). When no variants
 * are present a single default variant is synthesised from the root product.
 *
 * Prices are plain numbers or numeric strings. The `Discontinued` flag maps
 * to ARCHIVED status; active products are ACTIVE.
 */

import type {
  Product,
  ProductVariant,
  ProductStatus,
} from '../../../schema/product'
import { toIsoDatetime } from '@opensteward/shared'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Shift4Shop shapes ────────────────────────────────────────────────────

export interface RawShift4ShopSKU {
  SKUInfo?: {
    SKUStockAlerts?: unknown
    SKUID?: number | string
    SKUCode?: string | null
    SKUPrice?: number | string | null
    SKURetailPrice?: number | string | null
    SKUStock?: number | string | null
    SKUWeight?: number | string | null
    SKUWidth?: number | string | null
    SKUHeight?: number | string | null
    SKUDepth?: number | string | null
    SKUSalePrice?: number | string | null
    SKUCost?: number | string | null
    SKUBarCode?: string | null
    [key: string]: unknown
  }
  SKUOptionValues?: Array<{
    OptionName?: string | null
    OptionValue?: string | null
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface RawShift4ShopProduct {
  CatalogID?: number | string
  ProductName?: string | null
  Price?: number | string | null
  ListPrice?: number | string | null
  SalePrice?: number | string | null
  Cost?: number | string | null
  MFGID?: string | null
  UPC?: string | null
  Description?: string | null
  Discontinued?: string | number | boolean | null
  CategoryID?: number | string | null
  Stock?: number | string | null
  Weight?: number | string | null
  MainImageFile?: string | null
  MainImageCaption?: string | null
  ExtraImage1?: string | null
  ExtraImage2?: string | null
  ExtraImage3?: string | null
  ExtraImage4?: string | null
  Keywords?: string | null
  /** Array of variant SKUs */
  SKUInfo?: RawShift4ShopSKU[]
  DateAdded?: string | null
  DateModified?: string | null
  ProductLink?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/** Parse a decimal major-unit value and convert to integer minor units. */
function toMinor(v: number | string | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapStatus(discontinued: string | number | boolean | null | undefined): ProductStatus {
  if (discontinued == null) return 'ACTIVE'
  if (discontinued === true || discontinued === 1 || discontinued === '1' || discontinued === 'true') {
    return 'ARCHIVED'
  }
  return 'ACTIVE'
}

function buildImages(raw: RawShift4ShopProduct): Image[] {
  const images: Image[] = []
  if (raw.MainImageFile) {
    images.push({
      url: raw.MainImageFile,
      alt: raw.MainImageCaption ?? undefined,
      position: 1,
    })
  }
  const extras = [raw.ExtraImage1, raw.ExtraImage2, raw.ExtraImage3, raw.ExtraImage4]
  let position = 2
  for (const url of extras) {
    if (url) {
      images.push({ url, position: position++ })
    }
  }
  return images
}

export function transformProductVariant(
  raw: RawShift4ShopSKU,
  productId: string,
  currency: string = 'USD',
  fallbackPrice: number = 0,
): ProductVariant {
  const info = raw.SKUInfo ?? {}
  const id = info.SKUID != null ? String(info.SKUID) : `${productId}:sku`
  const price = toMinor(info.SKUPrice, currency) || fallbackPrice

  // Build optionValues map from SKUOptionValues.
  const optionValues: Record<string, string> = {}
  for (const ov of raw.SKUOptionValues ?? []) {
    const name = ov.OptionName
    const value = ov.OptionValue
    if (name && value) {
      optionValues[name] = value
    }
  }

  return {
    id,
    productId,
    sku: info.SKUCode || undefined,
    barcode: info.SKUBarCode || undefined,
    price: { amount: price, currency },
    compareAtPrice: info.SKURetailPrice != null
      ? { amount: toMinor(info.SKURetailPrice, currency), currency }
      : undefined,
    weight: info.SKUWeight != null ? toNum(info.SKUWeight) : undefined,
    weightUnit: info.SKUWeight != null ? 'lb' : undefined,
    optionValues: Object.keys(optionValues).length > 0 ? optionValues : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformProduct(raw: RawShift4ShopProduct, currency: string = 'USD'): Product {
  const productId = String(raw.CatalogID ?? '')
  const basePrice = toMinor(raw.Price, currency)

  // Transform variants from SKUInfo array.
  const skus = raw.SKUInfo ?? []
  let variants: ProductVariant[]

  if (skus.length > 0) {
    variants = skus.map((sku) => transformProductVariant(sku, productId, currency, basePrice))
  } else {
    // Synthesise a single default variant from the root product.
    variants = [
      {
        id: `${productId}:default`,
        productId,
        sku: raw.MFGID || undefined,
        barcode: raw.UPC || undefined,
        price: { amount: basePrice, currency },
        compareAtPrice: raw.ListPrice != null ? { amount: toMinor(raw.ListPrice, currency), currency } : undefined,
        weight: raw.Weight != null ? toNum(raw.Weight) : undefined,
        weightUnit: raw.Weight != null ? 'lb' : undefined,
        metadata: { synthetic: true, reason: 'Shift4Shop product has no SKU variants' },
      },
    ]
  }

  const images = buildImages(raw)

  const tags = raw.Keywords
    ? raw.Keywords.split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined

  // Build handle from ProductLink or product name.
  const handle = raw.ProductLink
    ? raw.ProductLink.replace(/\.html?$/i, '').split('/').pop()
    : undefined

  return {
    id: productId,
    title: raw.ProductName ?? '',
    description: raw.Description ?? undefined,
    handle,
    status: mapStatus(raw.Discontinued),
    tags: tags && tags.length > 0 ? tags : undefined,
    variants,
    images: images.length > 0 ? images : undefined,
    createdAt: toIsoDatetime(raw.DateAdded),
    updatedAt: toIsoDatetime(raw.DateModified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
