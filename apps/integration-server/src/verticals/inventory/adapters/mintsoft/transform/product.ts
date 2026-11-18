import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * Mintsoft product as returned by GET /api/Product/{id} and GET /api/Product/List.
 * Field names sourced from the Mintsoft Swagger spec Product definition.
 *
 * Key field notes:
 *   ID         – numeric product identifier (uppercase)
 *   DisCont    – discontinued flag (not "Discontinued")
 *   LastUpdated – ISO 8601 date-time of last modification
 */
export interface RawMintsoftProduct {
  ID: number
  SKU?: string
  Name?: string
  Description?: string
  EAN?: string
  UPC?: string
  Weight?: number
  Height?: number
  Width?: number
  Depth?: number
  Price?: number
  CostPrice?: number
  LowStockAlertLevel?: number
  DisCont?: boolean
  ClientId?: number
  WarehouseId?: number
  LastUpdated?: string
  CustomsDescription?: string
  CommodityCode?: unknown
  CountryOfManufacture?: unknown
  HasBatchNumber?: boolean
  HasSerialNumber?: boolean
  HasExpiryDate?: boolean
  [key: string]: unknown
}

export function transformProduct(raw: RawMintsoftProduct): Product {
  const idStr = String(raw.ID)

  // Mintsoft dimensions are in cm; weight in kg — normalise to grams.
  const weightGrams = raw.Weight !== undefined ? raw.Weight * 1000 : undefined

  // Mintsoft does not expose a per-product currency field so we default to GBP
  // (Mintsoft is UK-based).  Store the amount in minor units (pence).
  const retailPrice = raw.Price !== undefined
    ? { amount: Math.round(raw.Price * 100), currency: 'GBP' }
    : undefined

  return {
    id: idStr,
    externalId: idStr,
    sku: pickStr(raw.SKU) ?? '',
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.EAN) ?? pickStr(raw.UPC),
    category: undefined,
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm: raw.Height || raw.Width || raw.Depth
      ? { length: raw.Depth, width: raw.Width, height: raw.Height }
      : undefined,
    retailPrice,
    isActive: !(pickBool(raw.DisCont) ?? false),
    supplierIds: [],
    createdAt: undefined,
    updatedAt: toIso(raw.LastUpdated),
    platform: 'mintsoft',
    metadata: strMap({
      clientId: raw.ClientId,
      warehouseId: raw.WarehouseId,
      customsDescription: raw.CustomsDescription,
      lowStockAlertLevel: raw.LowStockAlertLevel,
      hasBatchNumber: raw.HasBatchNumber,
      hasSerialNumber: raw.HasSerialNumber,
      hasExpiryDate: raw.HasExpiryDate,
    }),
    raw,
  }
}
