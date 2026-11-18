/**
 * iQmetrix Catalog API — product transform.
 *
 * Source: GET /Companies({CompanyId})/Catalog/Items — returns CatalogItem list.
 * Each CatalogItem is a company-catalog entry.  Full product name + description
 * come from the separate ProductDetails endpoint
 * (GET /Companies({CompanyId})/Catalog/Items({CatalogItemId})/ProductDetails).
 *
 * We merge the flat CatalogItem envelope with an optional nested ProductDetails
 * payload when available (loaded by the adapter's enrichment pass).
 *
 * Key fields:
 *   CatalogItemId  — UUID, primary key in catalog
 *   CatalogSku     — 8-char opaque SKU assigned by iQmetrix
 *   Slug           — Product Library slug (e.g. "M1248-V1")
 *   RmsId          — Customer's own internal SKU / external ID
 *   LifeCycle      — "Active" | "Archived" etc.
 *   DateAddedUtc / DateUpdatedUtc
 *   ProductDetails.Name            — display name
 *   ProductDetails.ShortDescription
 *   ProductDetails.LongDescription
 *   ProductDetails.Manufacturer.Name
 *   ProductDetails.UpcCodes[].Value
 *   ProductDetails.ManufacturerSkus[].Value
 *   ProductDetails.MSRP.Amount / .CurrencyCode
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

/** Flat CatalogItem from GET /Companies({id})/Catalog/Items */
export interface RawIqmetrixCatalogItem {
  CatalogItemId: string
  CatalogSku?: string
  Slug?: string
  RmsId?: string
  DateAddedUtc?: string
  DateUpdatedUtc?: string
  IsArchived?: boolean
  NonStock?: boolean
  BatchTracking?: boolean
  MeasurementType?: string
  LifeCycle?: string
  SourceIds?: string[]
  /** Optionally merged from /ProductDetails endpoint */
  _productDetails?: RawIqmetrixProductDetails
  [key: string]: unknown
}

export interface RawIqmetrixProductDetails {
  Id?: string
  Name?: string
  ShortDescription?: string
  LongDescription?: string
  Manufacturer?: { Id?: number; Name?: string }
  UpcCodes?: Array<{ Value?: string; Description?: string }>
  ManufacturerSkus?: Array<{ Value?: string; EntityId?: number; EntityName?: string }>
  VendorSkus?: Array<{ Value?: string; EntityId?: number; EntityName?: string; Description?: string }>
  MSRP?: { Amount?: number; CurrencyCode?: string }
  DateAddedUtc?: string
  DateUpdatedUtc?: string
  IsArchived?: boolean
  CanonicalClassification?: { Id?: number; Name?: string; TreeId?: number }
  [key: string]: unknown
}

export function transformProduct(raw: RawIqmetrixCatalogItem): Product {
  const pd = raw._productDetails

  // Prefer RmsId (customer's own SKU) then CatalogSku (iQmetrix opaque code)
  const sku = pickStr(raw.RmsId) ?? pickStr(raw.CatalogSku) ?? ''

  // UPC from first UPC code entry
  const upc = pd?.UpcCodes?.find((u) => u.Value)?.Value

  // Manufacturer SKU — first ManufacturerSku entry
  const mfrSku = pd?.ManufacturerSkus?.find((s) => s.Value)?.Value

  // Vendor entity IDs as supplier references
  const supplierIds: string[] = []
  for (const v of pd?.VendorSkus ?? []) {
    if (v.EntityId !== undefined) supplierIds.push(String(v.EntityId))
  }

  // MSRP in minor units (cents). Amount is a decimal representing dollars.
  const msrp = pd?.MSRP
  const retailPrice = msrp?.Amount !== undefined
    ? { amount: Math.round(msrp.Amount * 100), currency: pickStr(msrp.CurrencyCode) ?? 'USD' }
    : undefined

  const isActive = (raw.LifeCycle ?? '').toLowerCase() !== 'archived'
    && !(raw.IsArchived ?? pd?.IsArchived ?? false)

  const category = pd?.CanonicalClassification?.Name

  return {
    id:              raw.CatalogItemId,
    externalId:      raw.CatalogItemId,
    sku,
    name:            pickStr(pd?.Name) ?? pickStr(raw.Slug) ?? '',
    description:     pickStr(pd?.LongDescription) ?? pickStr(pd?.ShortDescription),
    upc:             pickStr(upc),
    brand:           pickStr(pd?.Manufacturer?.Name),
    category:        pickStr(category),
    unitOfMeasure:   pickStr(raw.MeasurementType) ?? 'each',
    retailPrice,
    isActive,
    supplierIds,
    createdAt:       toIso(raw.DateAddedUtc ?? pd?.DateAddedUtc),
    updatedAt:       toIso(raw.DateUpdatedUtc ?? pd?.DateUpdatedUtc),
    platform:        'iqmetrix',
    metadata: strMap({
      catalogSku:      raw.CatalogSku,
      slug:            raw.Slug,
      rmsId:           raw.RmsId,
      lifeCycle:       raw.LifeCycle,
      manufacturerSku: mfrSku,
      nonStock:        raw.NonStock,
      batchTracking:   raw.BatchTracking,
    }),
    raw,
  }
}
