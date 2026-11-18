/**
 * MarketMan inventory item → canonical Product.
 *
 * Response shape from POST /buyers/inventory/GetInventoryItems
 * Response key: "Items"
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawMarketmanProduct {
  /** Internal numeric or string ID */
  ID?: string | number
  /** Display name */
  Name?: string
  CategoryID?: string | number
  CategoryName?: string
  /** Unit of measure name */
  UOMName?: string
  UOMID?: string | number
  /** Par / minimum level */
  MinOnHand?: number | null
  ParLevel?: number | null
  /** Current on-hand quantity (perpetual) */
  OnHand?: number | null
  /** Storage area names associated with this item (array) */
  StorageNames?: string[] | null
  /** Storage area IDs associated with string[] | null */
  StorageIDs?: string[] | null
  /** Bill-of-material cost price */
  BOMPrice?: number | null
  IsDeleted?: boolean | null
  /** Buyer GUID this record belongs to */
  GUID?: string
  /**
   * "2022/12/29 04:12:08" in the GetInventoryItems example. No UTC suffix and
   * no documented zone, and every unsuffixed date the docs pair with a UTC
   * twin (three order CreatedDate examples) sits four hours behind its
   * CreatedDateUTC. toIso reads it as UTC, so updatedAt may be off by the
   * buyer's UTC offset.
   */
  UpdateDate?: string | null
  /** Purchase items (vendors/suppliers) sub-array */
  PurchaseItems?: Array<{
    VendorName?: string | null
    VendorGuid?: string | null
    Price?: number | null
    ProductCode?: string | null
    ScanBarCode?: string | null
    PackQty?: number | null
    UOMName?: string | null
  }> | null
  [key: string]: unknown
}

export function transformProduct(raw: RawMarketmanProduct): Product {
  const id = String(raw.ID ?? '')
  const supplierIds: string[] = []
  for (const pi of raw.PurchaseItems ?? []) {
    if (pi.VendorGuid) supplierIds.push(pi.VendorGuid)
  }

  // Prefer barcode and product code from the first purchase item
  const firstPi = raw.PurchaseItems?.[0]
  const upc = pickStr(firstPi?.ScanBarCode)
  const sku = pickStr(firstPi?.ProductCode) ?? id

  return {
    id,
    externalId: id,
    sku,
    name: pickStr(raw.Name) ?? '',
    description: undefined,
    upc,
    brand: undefined,
    category: pickStr(raw.CategoryName),
    unitOfMeasure: pickStr(raw.UOMName) ?? 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: raw.BOMPrice != null ? { amount: raw.BOMPrice, currency: 'USD' } : undefined,
    isActive: pickBool(raw.IsDeleted) === true ? false : true,
    parentProductId: undefined,
    supplierIds,
    createdAt: undefined,
    updatedAt: toIso(raw.UpdateDate),
    platform: 'marketman',
    metadata: strMap({
      categoryId: raw.CategoryID,
      uomId: raw.UOMID,
      parLevel: raw.ParLevel,
      minOnHand: raw.MinOnHand,
      buyerGuid: raw.GUID,
      storageNames: Array.isArray(raw.StorageNames) ? raw.StorageNames.join(',') : raw.StorageNames,
    }),
    raw,
  }
}
