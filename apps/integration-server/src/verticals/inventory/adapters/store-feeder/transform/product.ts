/**
 * StoreFeeder product transform.
 *
 * Source: GET /products  and  GET /products/{productid}
 * Response wrapper: { TotalItems, TotalPages, PagingInfo, Data: ProductModel[] }
 *
 * Pricing fields (Price, RRP) are decimals already in display units (e.g. 12.99 GBP);
 * they are surfaced as-is under retailPrice.amount.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

interface WarehouseInfo {
  Warehouse?: { WarehouseID?: number; WarehouseName?: string }
  Weight?: number
  Dimensions?: { HeightMM?: number; WidthMM?: number; LengthMM?: number }
  UnitOfMeasure?: string
  ManualReorderLevel?: number
  NextDeliveryDate?: string
  [key: string]: unknown
}

interface PricingInfo {
  Price?: number
  RRP?: number
  AverageCost?: number
  [key: string]: unknown
}

interface TradeIdentifiers {
  EAN?: string
  UPC?: string
  [key: string]: unknown
}

interface SupplierEntry {
  Supplier?: { SupplierID?: number; Name?: string }
  Priority?: number
  [key: string]: unknown
}

export interface RawStoreFeederProduct {
  ProductID?: number
  SKU?: string
  Name?: string
  Description?: string
  Brand?: string
  ProductType?: string
  ProductGUID?: string
  Archived?: boolean
  IsAkit?: boolean
  ManufacturerPartNumber?: string
  CreatedOnDate?: string
  LastModifiedDate?: string
  GlobalTradeIdentifiers?: TradeIdentifiers
  WarehouseInformation?: WarehouseInfo | WarehouseInfo[]
  PricingInformation?: PricingInfo
  Suppliers?: SupplierEntry[]
  Categories?: Array<{ CategoryID?: number; CategoryName?: string }>
  [key: string]: unknown
}

export function transformProduct(raw: RawStoreFeederProduct): Product {
  const id = String(raw.ProductID ?? raw.ProductGUID ?? '')

  // Primary warehouse info (take first entry if array)
  const warehouseInfo: WarehouseInfo | undefined = Array.isArray(raw.WarehouseInformation)
    ? raw.WarehouseInformation[0]
    : raw.WarehouseInformation

  // Dimensions: StoreFeeder stores in mm → convert to cm
  let dimensionsCm: Product['dimensionsCm'] | undefined
  const dims = warehouseInfo?.Dimensions
  if (dims && (dims.HeightMM || dims.WidthMM || dims.LengthMM)) {
    dimensionsCm = {
      length: dims.LengthMM !== undefined ? dims.LengthMM / 10 : undefined,
      width: dims.WidthMM !== undefined ? dims.WidthMM / 10 : undefined,
      height: dims.HeightMM !== undefined ? dims.HeightMM / 10 : undefined,
    }
  }

  // Weight: WarehouseInformation.Weight in kg → grams
  const weightGrams = warehouseInfo?.Weight !== undefined
    ? warehouseInfo.Weight * 1000
    : undefined

  // Retail price from PricingInformation.Price (decimal; GBP assumed)
  const price = raw.PricingInformation?.Price
  const retailPrice = price !== undefined ? { amount: price, currency: 'GBP' } : undefined

  // Supplier IDs sorted by Priority ascending
  const supplierIds: string[] = (raw.Suppliers ?? [])
    .sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0))
    .map((s) => String(s.Supplier?.SupplierID ?? ''))
    .filter(Boolean)

  // Category — first entry name
  const category = raw.Categories?.[0]?.CategoryName

  // Trade identifiers — prefer UPC, fall back to EAN
  const upc = pickStr(raw.GlobalTradeIdentifiers?.UPC) ?? pickStr(raw.GlobalTradeIdentifiers?.EAN)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.SKU) ?? '',
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Description),
    upc,
    brand: pickStr(raw.Brand),
    category,
    unitOfMeasure: pickStr(warehouseInfo?.UnitOfMeasure) ?? 'each',
    weightGrams,
    dimensionsCm,
    retailPrice,
    isActive: !(pickBool(raw.Archived) ?? false),
    parentProductId: undefined,
    supplierIds,
    createdAt: toIso(raw.CreatedOnDate),
    updatedAt: toIso(raw.LastModifiedDate),
    platform: 'store-feeder',
    metadata: strMap({
      productType: raw.ProductType,
      productGUID: raw.ProductGUID,
      isAkit: raw.IsAkit,
      manufacturerPartNumber: raw.ManufacturerPartNumber,
    }),
    raw,
  }
}
