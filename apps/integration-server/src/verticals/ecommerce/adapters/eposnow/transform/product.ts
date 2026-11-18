/**
 * Epos Now Product -> canonical Product.
 *
 * Epos Now products have a flat structure with cost/sell prices stored as
 * decimals. Products belong to categories and can have multiple barcodes.
 */

import type { Product, ProductStatus } from '../../../schema/product'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Epos Now shapes ──────────────────────────────────────────────────────

export interface RawEposNowProduct {
  Id?: number
  Name?: string
  Description?: string
  CategoryId?: number
  CostPrice?: number
  SalePrice?: number
  Barcode?: string
  Sku?: string
  SellOnWeb?: boolean
  Archived?: boolean
  CreatedDate?: string
  LastUpdatedDate?: string
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(raw: RawEposNowProduct): ProductStatus {
  if (raw.Archived) return 'ARCHIVED'
  return 'ACTIVE'
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformProduct(raw: RawEposNowProduct): Product {
  const id = String(raw.Id ?? '')
  const price = raw.SalePrice ?? 0

  const variant = {
    id,
    productId: id,
    sku: raw.Sku ?? raw.Barcode ?? undefined,
    barcode: raw.Barcode ?? undefined,
    title: raw.Name ?? undefined,
    price: { amount: majorToMinor(price, 'GBP'), currency: 'GBP' },
    compareAtPrice: raw.CostPrice != null
      ? { amount: majorToMinor(raw.CostPrice, 'GBP'), currency: 'GBP' }
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }

  return {
    id,
    title: raw.Name ?? '',
    description: raw.Description ?? undefined,
    status: mapStatus(raw),
    variants: [variant],
    createdAt: raw.CreatedDate ?? undefined,
    updatedAt: raw.LastUpdatedDate ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Product -> Epos Now product body for create/update. */
export function untransformProduct(product: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (product.title != null) body['Name'] = product.title
  if (product.description != null) body['Description'] = product.description
  if (product.variants?.[0]?.sku) body['Sku'] = product.variants[0].sku
  if (product.variants?.[0]?.barcode) body['Barcode'] = product.variants[0].barcode
  if (product.variants?.[0]?.price) {
    body['SalePrice'] = product.variants[0].price.amount
  }
  if (product.variants?.[0]?.compareAtPrice) {
    body['CostPrice'] = product.variants[0].compareAtPrice.amount
  }
  if (product.status === 'ARCHIVED') body['Archived'] = true
  if (product.status === 'ACTIVE') body['Archived'] = false
  return body
}
