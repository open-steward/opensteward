/**
 * Transform a raw Tecsys OrderDynamics item/product response into the
 * canonical Product schema.
 *
 * OrderDynamics endpoint: GET /v1/items/{Sku} or GET /v1/items/
 * Key fields: Sku, PrimaryItemName, ProductBackendName, IsActive, Weight,
 *   UnitOfMeasure, DefaultSupplierSku, CreatedDate, LastModifiedDate
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawTecsysProduct {
  /** Item SKU — used as both id and sku. */
  Sku: string
  /** Human-readable product name shown on the storefront. */
  PrimaryItemName?: string
  /** Internal back-end product name (often the same as PrimaryItemName). */
  ProductBackendName?: string
  /** Short description or copy text. */
  Description?: string
  /** UPC / EAN barcode. */
  Upc?: string
  /** Brand or manufacturer name. */
  Brand?: string
  /** Product category name. */
  CategoryName?: string
  /** Unit of measure string (e.g. "Each", "Box"). */
  UnitOfMeasure?: string
  /** Weight in kilograms as returned by the API. */
  WeightKg?: number
  /** Length in centimetres. */
  LengthCm?: number
  /** Width in centimetres. */
  WidthCm?: number
  /** Height in centimetres. */
  HeightCm?: number
  /** Retail price (in the tenant's base currency). */
  RetailPrice?: number
  /** ISO 4217 currency code for RetailPrice. */
  Currency?: string
  /** Active/inactive flag. */
  IsActive?: boolean | string | number
  /** Parent SKU for variant products. */
  ParentSku?: string
  /** Internal name of the preferred supplier. */
  DefaultSupplierSku?: string
  /** ISO 8601 creation timestamp. */
  CreatedDate?: string
  /** ISO 8601 last-modification timestamp. */
  LastModifiedDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawTecsysProduct): Product {
  const supplierIds: string[] = []
  if (raw.DefaultSupplierSku) supplierIds.push(raw.DefaultSupplierSku)

  // RetailPrice is a decimal dollar amount; convert to integer minor units (cents)
  const retailPriceMinor =
    raw.RetailPrice !== undefined ? Math.round(raw.RetailPrice * 100) : undefined

  return {
    id: raw.Sku,
    externalId: raw.Sku,
    sku: pickStr(raw.Sku) ?? '',
    name: pickStr(raw.PrimaryItemName ?? raw.ProductBackendName) ?? '',
    description: pickStr(raw.Description),
    upc: pickStr(raw.Upc),
    brand: pickStr(raw.Brand),
    category: pickStr(raw.CategoryName),
    unitOfMeasure: pickStr(raw.UnitOfMeasure) ?? 'each',
    // API returns kg; schema wants grams
    weightGrams: raw.WeightKg !== undefined ? raw.WeightKg * 1000 : undefined,
    dimensionsCm:
      raw.LengthCm || raw.WidthCm || raw.HeightCm
        ? { length: raw.LengthCm, width: raw.WidthCm, height: raw.HeightCm }
        : undefined,
    retailPrice:
      retailPriceMinor !== undefined
        ? { amount: retailPriceMinor, currency: pickStr(raw.Currency) ?? 'USD' }
        : undefined,
    isActive: pickBool(raw.IsActive) ?? true,
    parentProductId: pickStr(raw.ParentSku),
    supplierIds,
    createdAt: toIso(raw.CreatedDate),
    updatedAt: toIso(raw.LastModifiedDate),
    platform: 'tecsys',
    metadata: strMap({ unitOfMeasure: raw.UnitOfMeasure, currency: raw.Currency }),
    raw,
  }
}
