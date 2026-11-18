/**
 * Snipcart Product → canonical Product.
 *
 * Snipcart's product API surfaces products that were imported from the
 * merchant's catalogue via the JSON crawler. The API can update inventory
 * but cannot create products — only fetch and archive them.
 *
 * Variants in Snipcart are represented as custom field combinations; Snipcart
 * does not expose a standalone variant object in the REST API. Inventory can
 * be tracked at the variant level via `inventoryManagementMethod: "Variant"`.
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/products
 */

import type { Product, ProductStatus } from '../../../schema/product'

// ── Raw Snipcart shapes ───────────────────────────────────────────────────────

export interface RawSnipcartProductStatistics {
  numberOfSales?: number
  totalSales?: number
}

export interface RawSnipcartProductVariant {
  variation?: Record<string, string>
  stock?: number
  allowOutOfStockPurchases?: boolean
}

export interface RawSnipcartProduct {
  id: string
  userDefinedId?: string | null
  name: string
  price?: number | null
  description?: string | null
  image?: string | null
  url?: string | null
  mode?: string
  archived?: boolean
  creationDate?: string | null
  modificationDate?: string | null
  stock?: number | null
  totalStock?: number | null
  inventoryManagementMethod?: string | null
  allowOutOfStockPurchases?: boolean
  customFields?: unknown[]
  variants?: RawSnipcartProductVariant[]
  statistics?: RawSnipcartProductStatistics
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: RawSnipcartProduct): ProductStatus | undefined {
  if (raw.archived) return 'ARCHIVED'
  if (raw.mode === 'Test') return 'DRAFT'
  return 'ACTIVE'
}

export function transformProduct(raw: RawSnipcartProduct): Product {
  return {
    id: raw.id,
    title: raw.name,
    description: raw.description ?? undefined,
    // Snipcart uses the product URL as handle — no slug concept
    handle: raw.url ?? undefined,
    status: mapStatus(raw),
    vendor: undefined,
    productType: undefined,
    tags: undefined,
    options: undefined,
    variants: undefined,
    images:
      raw.image
        ? [{ url: raw.image }]
        : undefined,
    createdAt: raw.creationDate ?? undefined,
    updatedAt: raw.modificationDate ?? undefined,
    publishedAt: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
