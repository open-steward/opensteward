/**
 * Kaufland Marketplace Product → canonical Product.
 *
 * Kaufland's product catalog uses EAN-based product data. The `product-data`
 * endpoint returns product attributes as a key-value map under `attributes`.
 * Each product has at most one "variant" (the unit/offer), so the canonical
 * `variants` array is always a single-element list derived from the matching
 * Unit (see inventory.ts for Unit transform).
 *
 * Docs: https://sellerapi.kaufland.com/?page=managing-product-data
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw Kaufland shapes ───────────────────────────────────────────────────────

/**
 * Product data object returned by GET /product-data/{ean}.
 * Attributes are a free-form key-value map; only the most common keys are
 * typed here.
 */
export interface RawKauflandProductAttribute {
  locale?: string
  values?: string[]
}

export interface RawKauflandProduct {
  /** Product catalog id (Kaufland internal). */
  id_product?: number | string
  /** EAN(s) for this product. */
  eans?: string[]
  /** Product title from catalog. */
  title?: string
  /** Category id. */
  id_category?: number | string
  /** Primary image URL. */
  main_picture?: string
  /** Manufacturer / brand. */
  manufacturer?: string
  /** Product page URL on Kaufland. */
  url?: string
  /** Storefront this product belongs to. */
  storefront?: string
  /** Whether this product is valid in the catalog. */
  is_valid?: boolean
  /** Raw attributes map from product-data endpoint. */
  attributes?: Record<string, string | string[] | RawKauflandProductAttribute>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatus(isValid: boolean | undefined): ProductStatus | undefined {
  if (isValid === undefined) return undefined
  return isValid ? 'ACTIVE' : 'DRAFT'
}

function extractImage(mainPicture: string | undefined): Image[] | undefined {
  if (!mainPicture) return undefined
  return [{ url: mainPicture }]
}

// ── Transforms ───────────────────────────────────────────────────────────────

/**
 * Transform a Kaufland product-data object to the canonical Product type.
 * Kaufland does not expose product descriptions via the Seller API (only
 * the attributes map), so `description` is omitted.
 */
export function transformProduct(raw: RawKauflandProduct): Product {
  const ean = (raw.eans ?? [])[0]
  return {
    id: raw.id_product != null ? String(raw.id_product) : (ean ?? ''),
    title: raw.title ?? '',
    description: undefined,
    // Kaufland does not have URL slugs — omit handle.
    handle: undefined,
    status: mapStatus(raw.is_valid),
    vendor: raw.manufacturer || undefined,
    productType: undefined,
    tags: undefined,
    options: undefined,
    variants: undefined,
    images: extractImage(raw.main_picture),
    createdAt: undefined,
    updatedAt: undefined,
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Kaufland product-data body for PUT /product-data.
 * Kaufland only allows updating catalog attributes for EAN-registered products.
 * The `ean` must be provided (taken from metadata or from canonical id).
 */
export function untransformProduct(
  product: Partial<Product>,
  ean?: string,
): Record<string, unknown> {
  const resolvedEan = ean ?? (product.metadata?.['eans'] as string[] | undefined)?.[0]
  return {
    ean: resolvedEan,
    attributes: {
      ...(product.title ? { title: product.title } : {}),
      ...(product.vendor ? { manufacturer: product.vendor } : {}),
    },
  }
}
