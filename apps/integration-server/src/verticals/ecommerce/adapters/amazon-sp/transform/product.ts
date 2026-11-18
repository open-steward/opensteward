/**
 * Amazon SP-API Listings / Catalog Item → canonical Product.
 *
 * Amazon represents a seller's listing in two related but distinct
 * namespaces:
 *
 *   1. Listings Items API (`/listings/2021-08-01`) — the seller's *own*
 *      offers. Keyed by `sellerId + sku`. This is what our adapter treats
 *      as the canonical Product because it is the one resource we can
 *      actually mutate on a seller's behalf.
 *
 *   2. Catalog Items API (`/catalog/2022-04-01`) — Amazon's global catalog
 *      of ASINs. These are shared across all sellers and cannot be
 *      mutated. When the Listings response includes an ASIN we surface it
 *      under `metadata.asin`.
 *
 * Amazon does **not** model variants as first-class resources; the
 * canonical `variants[]` array is therefore left unset. The SKU is the
 * product id.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawAmazonListingsItemSummary {
  marketplaceId?: string
  asin?: string
  productType?: string
  conditionType?: string
  status?: string[]
  itemName?: string
  createdDate?: string
  lastUpdatedDate?: string
  mainImage?: { link?: string; height?: number; width?: number }
  brand?: string
  manufacturer?: string
  modelNumber?: string
  itemClassification?: string
  [key: string]: unknown
}

export interface RawAmazonListingsItemImage {
  link: string
  height?: number
  width?: number
}

export interface RawAmazonListingsItem {
  sku: string
  summaries?: RawAmazonListingsItemSummary[]
  attributes?: Record<string, unknown>
  issues?: unknown[]
  offers?: unknown[]
  fulfillmentAvailability?: unknown[]
  images?: Array<{ marketplaceId?: string; images?: RawAmazonListingsItemImage[] }>
  productTypes?: Array<{ marketplaceId?: string; productType?: string }>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Amazon's listing status strings to the canonical product status.
 * Amazon publishes listings with status codes like `BUYABLE`, `DISCOVERABLE`,
 * or error states such as `INCOMPLETE_LISTING` / `INCOMPLETE_OFFER`. We
 * collapse these onto the small canonical enum.
 */
function mapStatus(status: string[] | undefined): ProductStatus | undefined {
  if (!status || status.length === 0) return undefined
  const upper = status.map((s) => s.toUpperCase())
  if (upper.includes('BUYABLE') || upper.includes('DISCOVERABLE')) return 'ACTIVE'
  if (upper.some((s) => s.startsWith('INCOMPLETE'))) return 'DRAFT'
  if (upper.includes('INACTIVE') || upper.includes('SUPPRESSED')) return 'ARCHIVED'
  return undefined
}

/**
 * Pick the summary row matching the seller's primary marketplace. This
 * transform simply uses the first summary — callers needing
 * marketplace-specific data can read `metadata` directly.
 */
function primarySummary(
  item: RawAmazonListingsItem,
): RawAmazonListingsItemSummary | undefined {
  return item.summaries?.[0]
}

function extractImages(item: RawAmazonListingsItem): Image[] | undefined {
  // Listings Items exposes `images: [{ marketplaceId, images: [{link, ...}] }]`.
  const bundle = item.images?.[0]
  const raw = bundle?.images ?? []
  if (raw.length === 0) {
    // Fall back to the summary mainImage, which many sellers rely on.
    const main = primarySummary(item)?.mainImage
    if (main?.link) {
      return [
        {
          url: main.link,
          width: main.width,
          height: main.height,
          position: 0,
        },
      ]
    }
    return undefined
  }
  return raw.map((img, i) => ({
    url: img.link,
    width: img.width,
    height: img.height,
    position: i,
  }))
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Amazon Listings Item → canonical Product.
 *
 * `sku` becomes the canonical `id` (Amazon sellers key inventory by SKU).
 * The ASIN, product type, brand, and manufacturer are surfaced through
 * the convenience fields on the canonical Product; the raw payload is
 * also retained in `metadata` per the shared adapter conventions.
 */
export function transformProduct(raw: RawAmazonListingsItem): Product {
  const summary = primarySummary(raw)
  const images = extractImages(raw)

  // Attributes is a bag of arbitrary Amazon-typed key/values. We pull
  // the common ones out into metadata beside the raw payload so they
  // don't get lost on clients that only read well-known metadata keys.
  const metadata: Record<string, unknown> = {
    ...(raw as unknown as Record<string, unknown>),
  }
  if (summary?.asin) metadata['asin'] = summary.asin
  if (summary?.productType) metadata['productType'] = summary.productType
  if (summary?.conditionType) metadata['conditionType'] = summary.conditionType

  return {
    id: raw.sku,
    title: summary?.itemName ?? raw.sku,
    status: mapStatus(summary?.status),
    vendor: summary?.brand ?? summary?.manufacturer ?? undefined,
    productType: summary?.productType ?? undefined,
    images,
    createdAt: summary?.createdDate,
    updatedAt: summary?.lastUpdatedDate,
    metadata,
  }
}

/**
 * Canonical Product → Amazon Listings Items PUT body.
 *
 * Amazon requires a `productType` plus an `attributes` bag keyed against
 * a per-seller schema registry. This transform accepts the caller's
 * `metadata.productType` + `metadata.attributes` as a pass-through and
 * falls back to `PRODUCT` (generic) if not supplied. Callers are
 * expected to understand their own schema — the adapter index documents
 * this.
 */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const productType =
    (product.metadata?.['productType'] as string | undefined) ??
    product.productType ??
    'PRODUCT'
  const attributes =
    (product.metadata?.['attributes'] as Record<string, unknown> | undefined) ?? {}
  // Always include the title (item_name) so callers get a usable listing
  // even if they don't populate the full attributes bag.
  if (product.title && attributes['item_name'] == null) {
    attributes['item_name'] = [{ value: product.title }]
  }
  return {
    productType,
    requirements: 'LISTING',
    attributes,
  }
}
