/**
 * Transform Restaurant365 OData `Item` entity -> canonical Product.
 *
 * R365 OData schema (https://odata.restaurant365.net/api/v2/views/Item):
 *   itemId       Guid   — primary key
 *   name         String — display name
 *   itemNumber   String — item number / code used as SKU
 *   category1    String — primary category
 *   category2    String — secondary category
 *   category3    String — tertiary category
 *   createdBy    String
 *   createdOn    DateTimeOffset
 *   modifiedBy   String
 *   modifiedOn   DateTimeOffset
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface RawR365Item {
  itemId: string
  name?: string
  itemNumber?: string
  category1?: string
  category2?: string
  category3?: string
  createdBy?: string
  createdOn?: string
  modifiedBy?: string
  modifiedOn?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawR365Item): Product {
  return {
    id: raw.itemId,
    externalId: raw.itemId,
    sku: pickStr(raw.itemNumber) ?? '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    upc: undefined,
    brand: undefined,
    category: pickStr(raw.category1),
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive: true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.modifiedOn),
    platform: 'restaurant365',
    metadata: strMap({
      category2: raw.category2,
      category3: raw.category3,
      createdBy: raw.createdBy,
      modifiedBy: raw.modifiedBy,
    }),
    raw,
  }
}
