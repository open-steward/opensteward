import type { Product } from '../../../schema/product'
import { toIso, pickStr, pickNum, strMap } from './shared'

/**
 * `ProductGet` → `mvProducts[]`.
 *
 * Fields read from the live service's own metadata on 2026-09-18
 * (https://api.megaventory.com/v2017a/json/metadata?op=ProductGet).
 *
 * Note `ProductDescription` is the product's NAME; the prose field is
 * `ProductLongDescription`. Mapping the two the other way round — which the
 * name invites — puts a paragraph in `name` and leaves `description` empty.
 */
export interface RawMegaventoryProduct {
  ProductID?: number
  ProductType?: string | null
  ProductSKU?: string | null
  ProductEAN?: string | null
  ProductDescription?: string | null
  ProductLongDescription?: string | null
  ProductCategoryID?: number | null
  ProductUnitOfMeasurement?: string | null
  ProductSellingPrice?: number | null
  ProductPurchasePrice?: number | null
  ProductUnitCost?: number | null
  ProductWeight?: number | null
  ProductLength?: number | null
  ProductBreadth?: number | null
  ProductHeight?: number | null
  ProductMainSupplierID?: number | null
  ProductCreationDate?: string | null
  IsSellable?: boolean | null
  IsPurchasable?: boolean | null
  [key: string]: unknown
}

export function transformProduct(raw: RawMegaventoryProduct): Product {
  const supplierId = pickNum(raw.ProductMainSupplierID)
  return {
    id: String(raw.ProductID ?? ''),
    externalId: String(raw.ProductID ?? ''),
    sku: pickStr(raw.ProductSKU) ?? '',
    // ProductDescription is the name. ProductLongDescription is the prose.
    name: pickStr(raw.ProductDescription) ?? '',
    description: pickStr(raw.ProductLongDescription),
    upc: pickStr(raw.ProductEAN),
    // `ProductCategoryID` is an id, and the canonical field is a category
    // NAME. Resolving it needs a second call to ProductCategoryGet; putting
    // the number here would render as a category called "17".
    category: undefined,
    unitOfMeasure: undefined,
    // Megaventory reports ProductWeight and ProductLength/Breadth/Height as
    // bare numbers and carries NO unit on the product — the unit is account
    // level (the service exposes a separate WeightUnitGet operation). The
    // canonical fields are fixed to grams and centimetres, so emitting the
    // raw number would assert a unit the payload never stated, and a weight
    // in pounds published as grams is wrong by 453x with nothing downstream
    // able to detect it. Left unset; the numbers survive on `raw`.
    weightGrams: undefined,
    dimensionsCm: undefined,
    // Same reason: ProductSellingPrice and ProductPurchasePrice are decimals
    // with no currency anywhere on the product (currency lives on locations
    // and purchase orders), and canonical Money requires an ISO 4217 code.
    cost: undefined,
    retailPrice: undefined,
    // Megaventory has no active/archived flag. Deletion is expressed through
    // the Delete/Undelete operations and the `showDeleted` request field, and
    // a default read returns only undeleted rows — so every row this adapter
    // sees is live.
    isActive: true,
    supplierIds: supplierId && supplierId > 0 ? [String(supplierId)] : [],
    createdAt: toIso(raw.ProductCreationDate),
    platform: 'megaventory',
    metadata: strMap({
      ProductType: raw.ProductType,
      ProductUnitOfMeasurement: raw.ProductUnitOfMeasurement,
      ProductCategoryID: raw.ProductCategoryID,
      ProductWeight: raw.ProductWeight,
      IsSellable: raw.IsSellable,
      IsPurchasable: raw.IsPurchasable,
    }),
    raw: raw as unknown as Record<string, unknown>,
  }
}
