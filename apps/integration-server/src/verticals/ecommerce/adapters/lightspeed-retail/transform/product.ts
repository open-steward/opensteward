/**
 * Lightspeed Retail Item → canonical Product.
 *
 * Lightspeed R-Series calls products "Items". Items have a flat structure
 * with pricing as decimal strings (e.g. "19.99"). Items in a matrix are
 * variations of a parent product.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Lightspeed shapes ──────────────────────────────────────────────────

export interface RawLightspeedItemPrice {
  amount?: string
  useType?: string
}

export interface RawLightspeedImage {
  imageID?: string
  src?: string
  alt?: string
}

export interface RawLightspeedCategory {
  categoryID?: string
  name?: string
}

export interface RawLightspeedItem {
  itemID: string
  systemSku?: string
  defaultCost?: string
  avgCost?: string
  discountable?: string
  tax?: string
  archived?: string
  itemType?: string
  description?: string
  modelYear?: string
  upc?: string
  ean?: string
  customSku?: string
  manufacturerSku?: string
  createTime?: string
  timeStamp?: string
  categoryID?: string
  taxClassID?: string
  departmentID?: string
  itemMatrixID?: string
  manufacturerID?: string
  seasonID?: string
  defaultVendorID?: string
  itemECount?: string
  reorderPoint?: string
  reorderLevel?: string
  qoh?: string
  Category?: RawLightspeedCategory
  Images?: { Image?: RawLightspeedImage | RawLightspeedImage[] }
  Prices?: { ItemPrice?: RawLightspeedItemPrice | RawLightspeedItemPrice[] }
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function lsDecimalToNumber(value: string | undefined): number {
  if (value == null || value === '') return 0
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function mapStatus(item: RawLightspeedItem): ProductStatus | undefined {
  if (item.archived === 'true') return 'ARCHIVED'
  return 'ACTIVE'
}

function mapImages(item: RawLightspeedItem): Image[] | undefined {
  const raw = item.Images?.Image
  if (!raw) return undefined
  const arr = Array.isArray(raw) ? raw : [raw]
  const images = arr
    .filter((img) => img.src)
    .map((img) => ({
      id: img.imageID,
      url: img.src!,
      alt: img.alt ?? undefined,
    }))
  return images.length > 0 ? images : undefined
}

function getDefaultPrice(item: RawLightspeedItem): number {
  const raw = item.Prices?.ItemPrice
  if (!raw) return lsDecimalToNumber(item.defaultCost)
  const arr = Array.isArray(raw) ? raw : [raw]
  const defaultPrice = arr.find((p) => p.useType === 'Default') ?? arr[0]
  return lsDecimalToNumber(defaultPrice?.amount)
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformProduct(raw: RawLightspeedItem): Product {
  const price = getDefaultPrice(raw)
  const images = mapImages(raw)

  return {
    id: raw.itemID,
    title: raw.description ?? '',
    description: raw.modelYear ?? undefined,
    status: mapStatus(raw),
    productType: raw.itemType || undefined,
    variants: [
      {
        id: raw.itemID,
        productId: raw.itemID,
        sku: raw.customSku || raw.systemSku || undefined,
        barcode: raw.upc || raw.ean || undefined,
        title: raw.description ?? undefined,
        price: { amount: majorToMinor(price, 'USD'), currency: 'USD' },
        metadata: raw as unknown as Record<string, unknown>,
      },
    ],
    images,
    createdAt: raw.createTime,
    updatedAt: raw.timeStamp,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product → Lightspeed Item body for create/update. */
export function untransformProduct(
  product: Partial<Product>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    description: product.title,
  }
  if (product.variants?.[0]) {
    const v = product.variants[0]
    if (v.sku) body['customSku'] = v.sku
    if (v.barcode) body['upc'] = v.barcode
  }
  if (product.description) body['modelYear'] = product.description
  return body
}
