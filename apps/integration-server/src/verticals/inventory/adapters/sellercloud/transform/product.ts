/**
 * Transform a Sellercloud catalog product record.
 *
 * Source endpoint: GET /rest/api/catalog
 * Docs: https://developer.sellercloud.com/dev-article/get-catalog-info-for-multiple-products/
 *
 * Key field mappings:
 *   ID              → id / externalId
 *   MerchantSKU     → sku
 *   ProductName     → name
 *   LongDescription → description
 *   UPC             → upc
 *   BrandName       → brand
 *   ActiveStatus    → isActive  (1 = active)
 *   MainProductID   → parentProductId
 *   VendorID        → supplierIds[0]
 *   DefaultVendorID → supplierIds[1] (deduped)
 *   ListPrice       → retailPrice (stored as integer minor units × 100 → cents)
 *   DateCreated     → createdAt
 *   LastModifiedDate→ updatedAt
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawSellercloudProduct {
  ID: string | number
  MerchantSKU?: string
  ProductName?: string
  LongDescription?: string
  ShortDescription?: string
  UPC?: string
  BrandName?: string
  BrandID?: number
  ActiveStatus?: number | boolean | string
  MainProductID?: string | number | null
  VendorID?: string | number | null
  DefaultVendorID?: string | number | null
  /** Weight in pounds — stored as-is; we convert to grams */
  WeightLbs?: number
  Weight?: number
  /** List/retail price in dollars */
  ListPrice?: number
  SalePrice?: number
  /** e.g. "Saved", "Ordered", etc. */
  ProductTypeName?: string
  DateCreated?: string
  LastModifiedDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSellercloudProduct): Product {
  const id = String(raw.ID)

  // Build supplier ID list; deduplicate
  const supplierSet = new Set<string>()
  if (raw.VendorID != null) supplierSet.add(String(raw.VendorID))
  if (raw.DefaultVendorID != null) supplierSet.add(String(raw.DefaultVendorID))

  // isActive: 1 = active, 0 = inactive; fallback to boolean/string
  const activeRaw = raw.ActiveStatus
  let isActive = true
  if (typeof activeRaw === 'number') {
    isActive = activeRaw !== 0
  } else {
    isActive = pickBool(activeRaw) ?? true
  }

  // Weight: prefer WeightLbs, convert lbs → grams (1 lb = 453.592 g)
  const weightLbs = raw.WeightLbs ?? raw.Weight
  const weightGrams = weightLbs !== undefined ? Math.round(weightLbs * 453.592) : undefined

  // Retail price stored as integer minor units (cents)
  const listPriceDollars = raw.ListPrice ?? raw.SalePrice
  const retailPrice =
    listPriceDollars !== undefined
      ? { amount: Math.round(listPriceDollars * 100), currency: 'USD' }
      : undefined

  const parentProductId =
    raw.MainProductID != null && raw.MainProductID !== '' && raw.MainProductID !== 0
      ? String(raw.MainProductID)
      : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.MerchantSKU) ?? '',
    name: pickStr(raw.ProductName) ?? '',
    description: pickStr(raw.LongDescription) ?? pickStr(raw.ShortDescription),
    upc: pickStr(raw.UPC),
    brand: pickStr(raw.BrandName),
    category: pickStr(raw.ProductTypeName),
    unitOfMeasure: 'each',
    weightGrams,
    retailPrice,
    isActive,
    parentProductId,
    supplierIds: [...supplierSet],
    createdAt: toIso(raw.DateCreated),
    updatedAt: toIso(raw.LastModifiedDate),
    platform: 'sellercloud',
    metadata: strMap({ brandId: raw.BrandID }),
    raw,
  }
}
