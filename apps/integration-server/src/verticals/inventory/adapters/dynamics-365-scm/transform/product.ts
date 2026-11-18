/**
 * Transform D365 SCM ReleasedProductV2 OData entity → canonical Product.
 *
 * OData entity: ReleasedProductsV2
 * Key fields (official schema):
 *   ItemNumber, ProductNumber, SearchName, INVENTORYUNITSYMBOL,
 *   SALESUNITSYMBOL, PURCHUNITSYMBOL, ITEMGROUP, ITEMMODELGROUPID,
 *   PRIMARYVENDORACCOUNTNUMBER, PURCHASEPRICE, SALESPRICE, UNITCOST,
 *   PRODUCTSUBTYPE (Product | ProductMaster)
 *
 * Additional fields available via $expand or extended entity:
 *   ProductName, Description, BarCode, NetWeight, GrossWeight,
 *   GrossDepth (Length), GrossWidth, GrossHeight, DataAreaId,
 *   IsPhantom, IsSold, IsPurchased, ProductionType
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawD365Product {
  /** Primary key — item number within the legal entity. */
  ItemNumber: string
  /** Shared product number (cross-entity). */
  ProductNumber?: string
  ProductName?: string
  SearchName?: string
  Description?: string
  BarCode?: string
  /** Item group ID (maps to category). */
  ITEMGROUP?: string
  ITEMMODELGROUPID?: string
  /** Inventory / purchase / sales units. */
  INVENTORYUNITSYMBOL?: string
  SALESUNITSYMBOL?: string
  PURCHUNITSYMBOL?: string
  /** Weight in kg (D365 stores in configured unit; treat as kg). */
  NetWeight?: number | string
  GrossWeight?: number | string
  /** Package dimensions in the configured unit. */
  GrossDepth?: number | string
  GrossWidth?: number | string
  GrossHeight?: number | string
  /** Costs / prices in the legal entity currency (raw decimal). */
  UNITCOST?: number | string
  PURCHASEPRICE?: number | string
  SALESPRICE?: number | string
  /** Primary vendor account number. */
  PRIMARYVENDORACCOUNTNUMBER?: string
  PRODUCTSUBTYPE?: string
  /** Production type: BOM, Formula, Item, Service, etc. */
  ProductionType?: string
  IsPhantom?: boolean | string
  IsSold?: boolean | string
  IsPurchased?: boolean | string
  /** Legal entity / data area. */
  DataAreaId?: string
  /** ISO timestamps or /Date(ms)/ values. */
  CreatedDateTime?: string
  ModifiedDateTime?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawD365Product): Product {
  const suppliers: string[] = []
  if (raw.PRIMARYVENDORACCOUNTNUMBER) suppliers.push(raw.PRIMARYVENDORACCOUNTNUMBER)

  const netWeightKg = pickNum(raw.NetWeight)
  const salePriceDecimal = pickNum(raw.SALESPRICE)

  return {
    id: raw.ItemNumber,
    externalId: raw.ItemNumber,
    sku: pickStr(raw.ItemNumber) ?? '',
    name: pickStr(raw.ProductName) ?? pickStr(raw.SearchName) ?? raw.ItemNumber,
    description: pickStr(raw.Description),
    upc: pickStr(raw.BarCode),
    brand: undefined, // not exposed on ReleasedProductV2
    category: pickStr(raw.ITEMGROUP),
    unitOfMeasure: pickStr(raw.INVENTORYUNITSYMBOL) ?? 'each',
    // D365 stores weight in kg; convert to grams
    weightGrams: netWeightKg !== undefined ? Math.round(netWeightKg * 1000) : undefined,
    dimensionsCm: raw.GrossDepth || raw.GrossWidth || raw.GrossHeight
      ? {
          length: pickNum(raw.GrossDepth),
          width: pickNum(raw.GrossWidth),
          height: pickNum(raw.GrossHeight),
        }
      : undefined,
    // Prices stored as decimal; express in minor units (cents) × 100
    retailPrice:
      salePriceDecimal !== undefined
        ? { amount: Math.round(salePriceDecimal * 100), currency: 'USD' }
        : undefined,
    isActive: pickBool(raw.IsSold) ?? true,
    parentProductId: raw.PRODUCTSUBTYPE === 'ProductMaster' ? undefined : pickStr(raw.ProductNumber),
    supplierIds: suppliers,
    createdAt: toIso(raw.CreatedDateTime),
    updatedAt: toIso(raw.ModifiedDateTime),
    platform: 'dynamics-365-scm',
    metadata: strMap({
      productNumber: raw.ProductNumber,
      dataAreaId: raw.DataAreaId,
      itemModelGroupId: raw.ITEMMODELGROUPID,
      productSubtype: raw.PRODUCTSUBTYPE,
      productionType: raw.ProductionType,
      isPurchased: raw.IsPurchased,
      isSold: raw.IsSold,
      isPhantom: raw.IsPhantom,
      purchaseUnitSymbol: raw.PURCHUNITSYMBOL,
      salesUnitSymbol: raw.SALESUNITSYMBOL,
    }),
    raw,
  }
}
