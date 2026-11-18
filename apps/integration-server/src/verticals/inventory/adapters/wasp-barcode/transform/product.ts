/**
 * Transform Wasp InventoryCloud item → canonical Product.
 *
 * InventoryCloud item fields (from advancedinfosearch / getinventoryitem):
 *   ItemNumber  — primary string key (used as id)
 *   ItemName    — display name
 *   Description — long description
 *   UPC         — barcode / UPC
 *   Category    — item category name
 *   UOM         — unit of measure string
 *   UnitPrice   — selling price (float, USD)
 *   Weight      — in pounds
 *   IsActive    — bool / "Y"/"N"
 *   VendorNumber — primary vendor/supplier identifier
 *   DateCreated / DateModified — ISO-ish datetime strings
 *
 * No integer minor-unit prices needed here: UnitPrice is a reference price
 * stored as a float, not a transaction amount. We preserve it as-is.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawWaspBarcodeProduct {
  ItemNumber?: string
  ItemName?: string
  Description?: string
  UPC?: string
  Category?: string
  UOM?: string
  UnitPrice?: number | string
  Weight?: number | string
  IsActive?: boolean | string | number
  VendorNumber?: string
  DateCreated?: string
  DateModified?: string
  LastModified?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawWaspBarcodeProduct): Product {
  const id = pickStr(raw.ItemNumber) ?? ''
  const supplierIds: string[] = []
  const vendorNum = pickStr(raw.VendorNumber)
  if (vendorNum) supplierIds.push(vendorNum)

  // Weight: InventoryCloud stores in pounds; convert to grams (1 lb ≈ 453.592 g)
  const weightLbs = pickNum(raw.Weight)
  const weightGrams = weightLbs !== undefined ? Math.round(weightLbs * 453.592) : undefined

  return {
    id,
    externalId: id,
    sku: id,
    name: pickStr(raw.ItemName) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.UPC),
    brand: undefined,
    category: pickStr(raw.Category),
    unitOfMeasure: pickStr(raw.UOM) ?? 'each',
    weightGrams,
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    parentProductId: undefined,
    supplierIds,
    createdAt: toIso(raw.DateCreated),
    updatedAt: toIso(raw.DateModified ?? raw.LastModified),
    platform: 'wasp-barcode',
    metadata: strMap({
      unitPrice: raw.UnitPrice,
      uom: raw.UOM,
      category: raw.Category,
    }),
    raw,
  }
}
