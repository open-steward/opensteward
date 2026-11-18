/**
 * Newegg Item → canonical Product.
 *
 * Newegg's Content Management API returns marketplace items identified
 * by Newegg Item Number or Seller Part Number. Each item has condition,
 * pricing, images, and shipping attributes.
 *
 * Canonical `Product.id` = Newegg Item Number (or Seller Part Number fallback).
 *
 * POST /contentmgmt/item/international → list (batch query, paginated)
 * GET  /contentmgmt/item/{sellerPartNumber} → get
 */

import type { Product, ProductStatus } from '../../../schema/product'
import type { Image } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawNeweggItem {
  NeweggItemNumber?: string
  SellerPartNumber?: string
  UPCCode?: string
  ManufacturerPartNumber?: string
  Description?: string
  Title?: string
  MfrName?: string
  SubCategoryID?: number
  SubCategoryName?: string
  Condition?: string    // 'New', 'Refurbished', 'UsedLikeNew', etc.
  Active?: boolean
  SellingPrice?: number
  Shipping?: string     // 'Free' or a dollar amount
  Currency?: string
  ImageUrl?: string
  AdditionalImageUrls?: string[]
  Inventory?: number
  Weight?: number
  ItemCondition?: number  // 1 = New, 2 = Refurbished, 3 = Used
  ParentDescription?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map Newegg Active flag + Condition to canonical ProductStatus.
 */
function mapStatus(item: RawNeweggItem): ProductStatus | undefined {
  if (item.Active === false) return 'ARCHIVED'
  if (item.Active === true) return 'ACTIVE'
  return 'DRAFT'
}

function extractImages(item: RawNeweggItem): Image[] | undefined {
  const images: Image[] = []

  if (item.ImageUrl) {
    images.push({ url: item.ImageUrl, position: 0 })
  }
  if (item.AdditionalImageUrls) {
    for (const url of item.AdditionalImageUrls) {
      images.push({ url, position: images.length })
    }
  }

  return images.length > 0 ? images : undefined
}

// ── Transform ────────────────────────────────────────────────────────────────

/**
 * Newegg Item → canonical Product.
 */
export function transformProduct(raw: RawNeweggItem): Product {
  return {
    id: raw.NeweggItemNumber ?? raw.SellerPartNumber ?? '',
    title: raw.Title ?? raw.Description ?? raw.SellerPartNumber ?? '',
    description: raw.Description ?? raw.ParentDescription,
    status: mapStatus(raw),
    vendor: raw.MfrName,
    productType: raw.SubCategoryName,
    images: extractImages(raw),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Product → Newegg item body for create/update.
 */
export function untransformProduct(data: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.id) body['SellerPartNumber'] = data.id
  if (data.title) body['Title'] = data.title
  if (data.description) body['Description'] = data.description
  if (data.vendor) body['MfrName'] = data.vendor
  if (data.productType) body['SubCategoryName'] = data.productType

  const images = data.images
  if (images && images.length > 0) {
    body['ImageUrl'] = images[0]!.url
    if (images.length > 1) {
      body['AdditionalImageUrls'] = images.slice(1).map((img) => img.url)
    }
  }

  // Preserve raw metadata fields for passthrough
  if (data.metadata) {
    const raw = data.metadata as Record<string, unknown>
    if (raw['UPCCode'] && !body['UPCCode']) body['UPCCode'] = raw['UPCCode']
    if (raw['ManufacturerPartNumber'] && !body['ManufacturerPartNumber']) {
      body['ManufacturerPartNumber'] = raw['ManufacturerPartNumber']
    }
    if (raw['SellingPrice'] && !body['SellingPrice']) body['SellingPrice'] = raw['SellingPrice']
    if (raw['Condition'] && !body['Condition']) body['Condition'] = raw['Condition']
  }

  return body
}
