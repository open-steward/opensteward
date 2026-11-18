import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap} from './shared'

/**
 * KORONA.cloud API v3 Product shape.
 * Codes array carries barcodes/SKUs; descriptions array carries text variants.
 * Prices array carries price-group-specific values; supplierPrices links suppliers.
 */
export interface RawKoronaPosProduct {
  id: string
  number?: string
  name?: string
  active?: boolean
  codes?: Array<{ productCode?: string; containerSize?: number }>
  descriptions?: Array<{ type?: string; text?: string }>
  prices?: Array<{ value?: number; priceGroup?: { id?: string; number?: string } }>
  supplierPrices?: Array<{ id?: string; supplier?: { id?: string; number?: string } }>
  sector?: { id?: string; number?: string; name?: string }
  commodityGroup?: { id?: string; number?: string; name?: string }
  packagingUnit?: string
  trackInventory?: boolean
  recommendedRetailPrice?: number
  lastPurchasePrice?: number
  [key: string]: unknown
}

export function transformProduct(raw: RawKoronaPosProduct): Product {
  // Primary barcode: first code entry's productCode
  const firstCode = raw.codes?.[0]?.productCode
  // Primary description: prefer 'DESCRIPTION' type, else first entry
  const descEntry =
    raw.descriptions?.find((d) => d.type === 'DESCRIPTION') ?? raw.descriptions?.[0]
  const description = pickStr(descEntry?.text)

  // Supplier IDs from supplierPrices
  const supplierIds = (raw.supplierPrices ?? [])
    .map((sp) => pickStr(sp.supplier?.id))
    .filter((id): id is string => Boolean(id))

  // Retail price: first price entry value (KORONA stores prices in the currency unit, not minor units)
  const firstPrice = raw.prices?.[0]?.value

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.number) ?? '',
    name: pickStr(raw.name) ?? '',
    description,
    upc: pickStr(firstCode),
    brand: undefined,
    category: pickStr(raw.commodityGroup?.name ?? raw.commodityGroup?.number),
    unitOfMeasure: pickStr(raw.packagingUnit) ?? 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice:
      firstPrice !== undefined
        ? { amount: Math.round(firstPrice * 100), currency: 'USD' }
        : undefined,
    isActive: pickBool(raw.active) ?? true,
    parentProductId: undefined,
    supplierIds,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'korona-pos',
    metadata: strMap({
      sector: raw.sector?.name ?? raw.sector?.number,
      commodityGroup: raw.commodityGroup?.name ?? raw.commodityGroup?.number,
      packagingUnit: raw.packagingUnit,
      trackInventory: raw.trackInventory,
    }),
    raw,
  }
}
