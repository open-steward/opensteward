/**
 * Transform a raw VARIO Cloud article (GET /erp/articles/{id}) into the
 * canonical Product schema.
 *
 * Field mapping:
 *   id            ← id (string)
 *   number        ← number (article number / SKU)
 *   name          ← name
 *   description   ← description
 *   active        ← active (boolean)
 *   productType   ← productType enum (WITH_STOCK, WITHOUT_STOCK, SERVICE_ARTICLE…)
 *   netSalesPrice ← netSalesPrice (decimal, stored as-is — no minor-unit conversion
 *                   because VARIO prices are always whole-currency in EUR)
 *   grossMetric   ← grossMetric.weight / sizeX / sizeY / sizeZ + units
 *   identifiers   ← identifiers[] (EAN, GTIN, etc.)
 *   productGroupRef.id ← category identifier
 *   manufacturerRef.id ← brand/manufacturer
 *   info.createdAt ← createdAt
 *   info.updatedAt ← updatedAt
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

interface VarioRef { id?: string | number; displayName?: string; [key: string]: unknown }

interface VarioMetric {
  weight?: number
  weightUnit?: VarioRef
  sizeX?: number
  sizeY?: number
  sizeZ?: number
  sizeUnit?: VarioRef
}

interface VarioIdentifier {
  value?: string
  name?: string
  defaultArticleIdentifier?: boolean
}

interface VarioMetaInfo {
  createdAt?: string
  updatedAt?: string
  createdFrom?: string
  updatedFrom?: string
}

export interface RawVarioArticle {
  id?: string | number
  number?: string
  name?: string
  alternativeName?: string
  description?: string
  active?: boolean
  deliverable?: boolean
  productType?: string
  netSalesPrice?: number
  grossSalesPrice?: number
  priceBase?: string
  basePriceUnit?: number
  grossMetric?: VarioMetric
  netMetric?: VarioMetric
  grossVolumeInCubicMeters?: number
  productUnit?: VarioRef
  identifiers?: VarioIdentifier[]
  productGroupRef?: VarioRef
  manufacturerRef?: VarioRef
  countryOfOriginRef?: VarioRef
  customsTariffNumber?: string
  version?: string
  info?: VarioMetaInfo
  [key: string]: unknown
}

export function transformProduct(raw: RawVarioArticle): Product {
  const id = String(raw.id ?? '')

  // First EAN/GTIN identifier or fall back to article number
  const eanIdentifier = raw.identifiers?.find(
    (i) => /ean|gtin|barcode/i.test(i.name ?? ''),
  )
  const upc = pickStr(eanIdentifier?.value)

  // Weight: VARIO stores in kg → convert to grams
  const weightKg = raw.grossMetric?.weight
  const weightGrams = weightKg !== undefined ? weightKg * 1000 : undefined

  // Dimensions: VARIO stores in cm (sizeX/Y/Z)
  const gm = raw.grossMetric
  const hasDims = gm && (gm.sizeX || gm.sizeY || gm.sizeZ)
  const dimensionsCm = hasDims
    ? { length: gm!.sizeX, width: gm!.sizeY, height: gm!.sizeZ }
    : undefined

  // Retail price — VARIO returns decimal EUR (e.g. 29.99).
  // Canonical schema requires integer minor units (cents). Multiply by 100 and round.
  const retailPrice =
    raw.netSalesPrice !== undefined
      ? { amount: Math.round(raw.netSalesPrice * 100), currency: 'EUR' }
      : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.number) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc,
    brand: pickStr(raw.manufacturerRef?.displayName),
    category: pickStr(raw.productGroupRef?.displayName),
    unitOfMeasure: pickStr(raw.productUnit?.displayName) ?? 'each',
    weightGrams,
    dimensionsCm,
    retailPrice,
    isActive: pickBool(raw.active) ?? true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.info?.createdAt),
    updatedAt: toIso(raw.info?.updatedAt),
    platform: 'vario-software',
    metadata: strMap({
      productType: raw.productType,
      deliverable: raw.deliverable,
      alternativeName: raw.alternativeName,
      customsTariffNumber: raw.customsTariffNumber,
      countryOfOrigin: raw.countryOfOriginRef?.displayName,
      version: raw.version,
    }),
    raw,
  }
}
