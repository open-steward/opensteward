/**
 * Deck Commerce does not expose a product catalog REST endpoint in its OMS API.
 * Products are managed in the upstream eCommerce platform (Shopify, Salesforce CC, etc.).
 *
 * This transform is included for structural completeness and handles any ad-hoc
 * product-like data surfaced in order line items or inventory feed responses.
 *
 * Known fields from order line items:
 *   SKU, ItemName, UPC, Description, ItemCategory, IsActive
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawDeckCommerceProduct {
  /** Primary identifier — could be SKU or an internal item ID */
  SKU?: string
  ItemID?: string
  ItemName?: string
  Description?: string
  UPC?: string
  ItemCategory?: string
  IsActive?: boolean | string
  CreatedDateUTC?: string
  LastModifiedDateUTC?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawDeckCommerceProduct): Product {
  const id = pickStr(raw.ItemID ?? raw.SKU) ?? ''
  return {
    id,
    externalId: id,
    sku: pickStr(raw.SKU) ?? id,
    name: pickStr(raw.ItemName) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.UPC),
    brand: undefined,
    category: pickStr(raw.ItemCategory),
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.CreatedDateUTC),
    updatedAt: toIso(raw.LastModifiedDateUTC),
    platform: 'deck-commerce',
    metadata: strMap({}),
    raw,
  }
}
