/**
 * eBay Inventory Item → canonical Product.
 *
 * eBay's Sell Inventory API models products as "inventory items" keyed by
 * seller-defined SKU. Creating a listing involves creating an inventory
 * item, then an offer, then publishing — this adapter treats the
 * inventory item as the canonical Product.
 *
 * Canonical `Product.id` = SKU (same pattern as Amazon SP-API).
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawEbayProductAspect {
  [key: string]: string[]
}

export interface RawEbayImage {
  imageUrl: string
  height?: number
  width?: number
}

export interface RawEbayAvailability {
  shipToLocationAvailability?: {
    quantity?: number
    allocationByFormat?: unknown
  }
  pickupAtLocationAvailability?: unknown[]
}

export interface RawEbayInventoryItem {
  sku: string
  locale?: string
  product?: {
    title?: string
    description?: string
    aspects?: RawEbayProductAspect
    brand?: string
    mpn?: string
    ean?: string[]
    isbn?: string[]
    upc?: string[]
    imageUrls?: string[]
    epid?: string
  }
  condition?: string
  conditionDescription?: string
  availability?: RawEbayAvailability
  packageWeightAndSize?: {
    weight?: { value?: number; unit?: string }
    dimensions?: { length?: number; width?: number; height?: number; unit?: string }
  }
  /**
   * Group membership — present on `GET /inventory_item/{sku}` responses
   * (`InventoryItemWithSkuLocaleGroupid`). A SKU that belongs to an
   * `inventory_item_group` carries the group's key here; that key is the
   * canonical `ProductVariant.productId`. See transform/variant.ts.
   */
  inventoryItemGroupKeys?: string[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map eBay condition strings to canonical product status.
 * eBay inventory items don't have an explicit "status" — we infer from
 * presence of product data. If there's a title, it's ACTIVE; otherwise DRAFT.
 */
function mapStatus(item: RawEbayInventoryItem): ProductStatus | undefined {
  if (item.product?.title) return 'ACTIVE'
  return 'DRAFT'
}

function extractImages(item: RawEbayInventoryItem): Image[] | undefined {
  const urls = item.product?.imageUrls
  if (!urls || urls.length === 0) return undefined
  return urls.map((url, i) => ({
    url,
    position: i,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * eBay Inventory Item → canonical Product.
 */
export function transformProduct(raw: RawEbayInventoryItem): Product {
  const images = extractImages(raw)
  const product = raw.product

  const metadata: Record<string, unknown> = {
    ...(raw as unknown as Record<string, unknown>),
  }
  if (raw.condition) metadata['condition'] = raw.condition
  if (product?.epid) metadata['epid'] = product.epid

  return {
    id: raw.sku,
    title: product?.title ?? raw.sku,
    description: product?.description,
    status: mapStatus(raw),
    vendor: product?.brand ?? undefined,
    productType: product?.aspects?.['Type']?.[0] ?? undefined,
    images,
    metadata,
  }
}

/**
 * Canonical Product → eBay Inventory Item PUT body.
 *
 * eBay's PUT on inventory_item is an upsert. The caller provides SKU in
 * the URL and the body contains the inventory item payload.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const imageUrls = data.images?.map((img) => img.url) ?? []
  const product: Record<string, unknown> = {}
  if (data.title) product['title'] = data.title
  if (data.description) product['description'] = data.description
  if (imageUrls.length > 0) product['imageUrls'] = imageUrls
  if (data.vendor) product['brand'] = data.vendor

  // Pass through any raw attributes from metadata
  const rawProduct = data.metadata?.['product'] as Record<string, unknown> | undefined
  if (rawProduct) {
    Object.assign(product, rawProduct)
    // Ensure caller-provided fields take precedence
    if (data.title) product['title'] = data.title
    if (data.description) product['description'] = data.description
  }

  const body: Record<string, unknown> = { product }

  // Preserve condition and availability if provided via metadata
  const condition = data.metadata?.['condition'] as string | undefined
  if (condition) body['condition'] = condition

  const availability = data.metadata?.['availability'] as Record<string, unknown> | undefined
  if (availability) body['availability'] = availability

  return body
}
