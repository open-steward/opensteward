/**
 * Transform SYSPRO InvMaster OData entity → canonical Product.
 *
 * SYSPRO OData entity: InvMaster
 * Key field: StockCode
 *
 * Confirmed field names from SYSPRO 8 database schema and OData docs:
 *   StockCode, Description, LongDescription, ProductClass, Uom,
 *   AlternateUom, Mass (kg per stocking unit), Volume,
 *   ListPrice, PriceCode, PrimarySupplier, Buyer,
 *   StockCodeStatus (N=Normal, T=Temporary, C=Clear/inactive),
 *   AlternateKey1, AlternateKey2, UserField1-5, DateOfSupersession
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface RawSysproProduct {
  /** Primary key */
  StockCode: string
  Description?: string
  LongDescription?: string
  ProductClass?: string
  /** Stocking unit of measure */
  Uom?: string
  AlternateUom?: string
  /** Mass per stocking unit in kg */
  Mass?: number
  Volume?: number
  /** List price in company functional currency (major units) */
  ListPrice?: number
  PriceCode?: string
  /** Primary supplier code */
  PrimarySupplier?: string
  Buyer?: string
  /** N=Normal, T=Temporary, C=Clear (inactive) */
  StockCodeStatus?: string
  /** Barcode / alternate lookup key */
  AlternateKey1?: string
  AlternateKey2?: string
  UserField1?: string
  UserField2?: string
  UserField3?: string
  UserField4?: string
  UserField5?: string
  DateOfSupersession?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawSysproProduct): Product {
  // StockCodeStatus: 'C' = cleared/inactive; 'T' = temporary; 'N' = normal
  const isActive = (raw.StockCodeStatus ?? 'N') !== 'C'

  return {
    id: raw.StockCode,
    externalId: raw.StockCode,
    sku: raw.StockCode,
    name: pickStr(raw.Description) ?? raw.StockCode,
    description: pickStr(raw.LongDescription),
    // AlternateKey1 is the primary barcode/EAN field in SYSPRO
    upc: pickStr(raw.AlternateKey1),
    brand: undefined,
    category: pickStr(raw.ProductClass),
    unitOfMeasure: pickStr(raw.Uom) ?? 'each',
    // Mass stored in kg; canonical schema expects grams
    weightGrams: raw.Mass !== undefined ? raw.Mass * 1000 : undefined,
    // SYSPRO stores scalar volume, not individual L×W×H — omit dimensionsCm
    dimensionsCm: undefined,
    // ListPrice is in major units (company currency). Currency is not available
    // on the InvMaster entity in OData; include only metadata, not a price object,
    // to avoid integer-minor-unit ambiguity.
    retailPrice: undefined,
    isActive,
    parentProductId: undefined,
    supplierIds: raw.PrimarySupplier ? [raw.PrimarySupplier] : [],
    createdAt: toIso(raw.DateOfSupersession),
    updatedAt: undefined,
    platform: 'syspro',
    metadata: strMap({
      productClass:    raw.ProductClass,
      stockCodeStatus: raw.StockCodeStatus,
      uom:             raw.Uom,
      alternateUom:    raw.AlternateUom,
      buyer:           raw.Buyer,
      priceCode:       raw.PriceCode,
      alternateKey1:   raw.AlternateKey1,
      alternateKey2:   raw.AlternateKey2,
      userField1:      raw.UserField1,
      userField2:      raw.UserField2,
      userField3:      raw.UserField3,
      userField4:      raw.UserField4,
      userField5:      raw.UserField5,
    }),
    raw,
  }
}
