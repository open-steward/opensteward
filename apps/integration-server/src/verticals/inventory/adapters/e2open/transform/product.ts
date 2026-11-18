/**
 * Transform E2open CDM Inventory / item master records into canonical Product.
 *
 * E2open CDM fields (from Inventory entity + Fields API):
 *   partnerSkuCode       — partner's internal SKU identifier
 *   validatedSkuCode     — e2open-validated (canonical) SKU code
 *   skuDescription       — human-readable product description
 *   brandName            — brand / manufacturer name
 *   categoryCode         — product category code
 *   uomCode              — unit of measure code (e.g. "EA", "CS")
 *   listPrice            — list price (float USD)
 *   listPrice2, listPrice3 — alternate price tiers
 *   currencyCode         — ISO-4217 currency code for prices
 *   weightUom            — weight unit of measure
 *   grossWeight          — gross weight value
 *   isActive             — active flag (boolean or "Y"/"N")
 *   parentSkuCode        — parent SKU for variant products
 *   partnerCode          — partner identifier (supplier/manufacturer)
 *   createdDate          — ISO date string
 *   lastModifiedDate     — ISO date string
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso, toMinorUnits} from './shared'

export interface RawE2openProduct {
  /** e2open internal record ID (may be absent; use partnerSkuCode as fallback key). */
  id?: string
  partnerSkuCode?: string
  validatedSkuCode?: string
  skuDescription?: string
  brandName?: string
  categoryCode?: string
  uomCode?: string
  listPrice?: number | string
  listPrice2?: number | string
  listPrice3?: number | string
  currencyCode?: string
  grossWeight?: number | string
  weightUom?: string
  isActive?: boolean | string
  parentSkuCode?: string
  partnerCode?: string
  partnerName?: string
  createdDate?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawE2openProduct): Product {
  const id = pickStr(raw.id) ?? pickStr(raw.partnerSkuCode) ?? pickStr(raw.validatedSkuCode) ?? ''
  const sku = pickStr(raw.partnerSkuCode) ?? pickStr(raw.validatedSkuCode) ?? ''

  // Convert list price to integer minor units (cents)
  const currency = pickStr(raw.currencyCode) ?? 'USD'
  const listPriceMinor = toMinorUnits(raw.listPrice)

  return {
    id,
    externalId:      id,
    sku,
    name:            pickStr(raw.skuDescription) ?? sku,
    description:     undefined,
    upc:             undefined,
    brand:           pickStr(raw.brandName),
    category:        pickStr(raw.categoryCode),
    unitOfMeasure:   pickStr(raw.uomCode) ?? 'each',
    weightGrams:     undefined, // E2open grossWeight unit varies; no safe conversion without uom mapping
    dimensionsCm:    undefined,
    retailPrice:     listPriceMinor !== undefined
      ? { amount: listPriceMinor, currency }
      : undefined,
    isActive:        pickBool(raw.isActive) ?? true,
    parentProductId: pickStr(raw.parentSkuCode),
    supplierIds:     raw.partnerCode ? [raw.partnerCode] : [],
    createdAt:       toIso(raw.createdDate),
    updatedAt:       toIso(raw.lastModifiedDate),
    platform:        'e2open',
    metadata:        strMap({
      validatedSkuCode: raw.validatedSkuCode,
      partnerCode:      raw.partnerCode,
      partnerName:      raw.partnerName,
      weightUom:        raw.weightUom,
      grossWeight:      raw.grossWeight,
      listPrice2:       raw.listPrice2,
      listPrice3:       raw.listPrice3,
    }),
    raw,
  }
}
