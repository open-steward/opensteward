/**
 * Transform a raw Xentral V1 product object to the canonical Product schema.
 *
 * Source: GET /api/v1/products  /  GET /api/v1/products/{id}
 *
 * Key field mappings:
 *   id              → id / externalId
 *   number          → sku
 *   name            → name
 *   description     → description  (primaryLanguage.description fallback)
 *   ean             → upc
 *   manufacturerName→ brand
 *   category.name   → category
 *   unit.name       → unitOfMeasure
 *   measurements.weight.value (kg) → weightGrams (* 1000)
 *   measurements.{length,width,height}.value (cm) → dimensionsCm
 *   salesPriceNet / salesPriceGross → retailPrice (minor units)
 *   isDisabled      → isActive (inverted)
 *   variantOf.id    → parentProductId
 *   standardSupplier.id → supplierIds[0]
 *   updatedAt       → updatedAt
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso, amountToMinorUnits} from './shared'

interface XentralMoney {
  amount?: string | number
  currency?: string
}

interface XentralMeasurement {
  value?: number
  unit?: string
}

export interface RawXentralProduct {
  id: string
  uuid?: string
  number?: string
  name?: string
  description?: string
  shortDescription?: string
  ean?: string
  manufacturerName?: string
  manufacturerNumber?: string
  category?: { id?: string; name?: string }
  unit?: { name?: string }
  measurements?: {
    weight?: XentralMeasurement
    netWeight?: XentralMeasurement
    length?: XentralMeasurement
    width?: XentralMeasurement
    height?: XentralMeasurement
  }
  salesPriceNet?: XentralMoney
  salesPriceGross?: XentralMoney
  purchasePriceNet?: XentralMoney
  isDisabled?: boolean
  isStockItem?: boolean
  standardSupplier?: { id?: string }
  variantOf?: { id?: string }
  isVariant?: boolean
  hasBillOfMaterials?: boolean
  textsAndDescriptions?: {
    primaryLanguage?: {
      name?: string
      description?: string
      shortDescription?: string
    }
  }
  updatedAt?: string
  tags?: Array<{ id?: string; key?: string; name?: string }>
  [key: string]: unknown
}

export function transformProduct(raw: RawXentralProduct): Product {
  const supplierIds: string[] = []
  if (raw.standardSupplier?.id) supplierIds.push(raw.standardSupplier.id)

  // Prefer top-level description, fall back to primaryLanguage
  const description =
    pickStr(raw.description) ??
    pickStr(raw.textsAndDescriptions?.primaryLanguage?.description)

  // Dimensions: Xentral stores cm for lengths; no conversion needed
  const m = raw.measurements
  const hasDimensions =
    m?.length?.value !== undefined ||
    m?.width?.value !== undefined ||
    m?.height?.value !== undefined
  const dimensionsCm = hasDimensions
    ? {
        length: m?.length?.value,
        width: m?.width?.value,
        height: m?.height?.value,
      }
    : undefined

  // Weight: stored as kg; convert to grams
  const weightGrams =
    m?.weight?.value !== undefined ? m.weight.value * 1000 : undefined

  // Price: prefer net price; amounts come as string floats → minor units
  const priceObj = raw.salesPriceNet ?? raw.salesPriceGross
  const retailPrice =
    priceObj?.amount !== undefined
      ? {
          amount: amountToMinorUnits(priceObj.amount) ?? 0,
          currency: pickStr(priceObj.currency) ?? 'EUR',
        }
      : undefined

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.number) ?? '',
    name: pickStr(raw.name) ?? '',
    description,
    upc: pickStr(raw.ean),
    brand: pickStr(raw.manufacturerName),
    category: pickStr(raw.category?.name),
    unitOfMeasure: pickStr(raw.unit?.name) ?? 'each',
    weightGrams,
    dimensionsCm,
    retailPrice,
    isActive: !(pickBool(raw.isDisabled) ?? false),
    parentProductId: raw.isVariant ? pickStr(raw.variantOf?.id) : undefined,
    supplierIds,
    updatedAt: toIso(raw.updatedAt),
    platform: 'xentral',
    metadata: strMap({
      uuid: raw.uuid,
      manufacturerNumber: raw.manufacturerNumber,
      customsTariffNumber: raw.customsTariffNumber,
      isStockItem: raw.isStockItem,
    }),
    raw,
  }
}
