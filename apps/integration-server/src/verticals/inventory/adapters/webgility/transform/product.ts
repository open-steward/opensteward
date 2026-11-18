/**
 * Webgility Connect Items API → Product transform.
 *
 * Endpoint: GET /v1/items, GET /v1/items/{ItemId}
 * Ref: https://github.com/webgility/connect-v1.0/wiki/Items-API
 */
import type { Product } from '../../../schema/product'
import { pickStr, pickBool, strMap, toIso } from './shared'

export interface RawWebgilityItem {
  /** Unique item identifier returned by Webgility */
  ItemId: string
  /** User-defined item code (max 30 chars, Xero only) */
  ItemCode?: string
  /** User-defined item name (max 100 chars, QBO only) */
  ItemName?: string
  Description?: string
  IsActive?: boolean
  IsTaxable?: boolean
  /** "Inventory", "Non Inventory", or null */
  ItemType?: string
  TrackInventory?: boolean
  /** Current quantity on hand (QuickBooks) */
  QBQtyOnHand?: number
  QBAssetAccountCode?: string
  QBPurchaseDescription?: string
  SalesDetails?: {
    UnitPrice?: number
    AccountCode?: string
  }
  PurchaseDetails?: {
    UnitPrice?: number
    AccountCode?: string
  }
  ResponseAt?: string
  CreatedAt?: string
  UpdatedAt?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawWebgilityItem): Product {
  const salesPrice = raw.SalesDetails?.UnitPrice
  return {
    id: raw.ItemId,
    externalId: raw.ItemId,
    sku: pickStr(raw.ItemCode) ?? pickStr(raw.ItemName) ?? '',
    name: pickStr(raw.ItemName) ?? pickStr(raw.ItemCode) ?? '',
    description: pickStr(raw.Description) ?? pickStr(raw.QBPurchaseDescription),
    upc: undefined,
    brand: undefined,
    category: pickStr(raw.ItemType),
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice:
      salesPrice !== undefined
        ? { amount: Math.round(salesPrice * 100), currency: 'USD' }
        : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.CreatedAt),
    updatedAt: toIso(raw.UpdatedAt),
    platform: 'webgility',
    metadata: strMap({
      itemType: raw.ItemType,
      trackInventory: raw.TrackInventory,
      isTaxable: raw.IsTaxable,
      qbAssetAccountCode: raw.QBAssetAccountCode,
    }),
    raw,
  }
}
