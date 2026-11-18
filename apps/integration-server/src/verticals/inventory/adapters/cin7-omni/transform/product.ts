import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawCin7OmniProduct {
  ID: string
  SKU?: string
  Name?: string
  Description?: string
  Barcode?: string
  Brand?: string
  Category?: string
  Type?: string
  StockLocator?: string
  Weight?: number
  Length?: number
  Width?: number
  Height?: number
  CostingMethod?: string
  PriceTier1?: number
  DefaultLocation?: string
  IsActive?: boolean | string
  ParentProductID?: string
  DefaultSupplier?: { ID: string; Name: string }
  AdditionalSuppliers?: Array<{ SupplierID: string }>
  CreatedDate?: string
  LastModifiedOn?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawCin7OmniProduct): Product {
  const suppliers: string[] = []
  if (raw.DefaultSupplier?.ID) suppliers.push(raw.DefaultSupplier.ID)
  for (const s of raw.AdditionalSuppliers ?? []) suppliers.push(s.SupplierID)

  return {
    id: raw.ID,
    externalId: raw.ID,
    sku: pickStr(raw.SKU) ?? '',
    name: pickStr(raw.Name) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.Barcode),
    brand: pickStr(raw.Brand),
    category: pickStr(raw.Category),
    unitOfMeasure: 'each',
    weightGrams: raw.Weight !== undefined ? raw.Weight * 1000 : undefined,
    dimensionsCm: raw.Length || raw.Width || raw.Height ? {
      length: raw.Length, width: raw.Width, height: raw.Height,
    } : undefined,
    retailPrice: raw.PriceTier1 !== undefined ? { amount: raw.PriceTier1, currency: 'USD' } : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    parentProductId: pickStr(raw.ParentProductID),
    supplierIds: suppliers,
    createdAt: toIso(raw.CreatedDate),
    updatedAt: toIso(raw.LastModifiedOn),
    platform: 'cin7-omni',
    metadata: strMap({ type: raw.Type, costingMethod: raw.CostingMethod, stockLocator: raw.StockLocator }),
    raw,
  }
}
