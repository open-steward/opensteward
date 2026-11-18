/**
 * Transform a raw 3PL Central SKU item (from GET /customers/{id}/items or
 * GET /customers/{id}/items/{itemId}) into a canonical Product.
 *
 * Real field names come from the 3PL Central HAL+JSON response where top-level
 * keys are camelCase (sku, upc, description) and nested identifiers follow the
 * pattern xyzIdentifier: { name, id }.
 * ReadOnly sub-object carries itemId, creationDate, lastModifiedDate, deactivated.
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface Raw3plCentralItem {
  /** Nested inside readOnly sub-object */
  readOnly?: {
    itemId?: number
    creationDate?: string
    lastModifiedDate?: string
    deactivated?: boolean
    customerIdentifier?: { externalId?: string; name?: string; id?: number }
  }
  itemId?: number
  sku?: string
  upc?: string
  description?: string
  description2?: string
  inventoryCategory?: string
  classificationIdentifier?: { name?: string; id?: number }
  cost?: number
  price?: number
  accountRef?: string
  countryOfManufacture?: string
  harmonizedCode?: string
  /** Packaging / unit-of-measure details */
  options?: {
    inventoryUnit?: {
      unitIdentifier?: { name?: string; id?: number }
      minimumStock?: number
      maximumStock?: number
      reorderQuantity?: number
    }
    packageUnit?: {
      imperial?: { netWeight?: number; length?: number; width?: number; height?: number; weight?: number }
      metric?: { netWeight?: number; length?: number; width?: number; height?: number; weight?: number }
      upc?: string
    }
  }
  [key: string]: unknown
}

export function transformProduct(raw: Raw3plCentralItem): Product {
  const itemId = raw.readOnly?.itemId ?? raw.itemId
  const id = String(itemId ?? '')

  const pkg = raw.options?.packageUnit
  const imperial = pkg?.imperial
  const unitName = raw.options?.inventoryUnit?.unitIdentifier?.name

  // Weight: 3PL Central uses imperial pounds → convert to grams (1 lb = 453.592 g)
  const weightLbs = imperial?.weight ?? imperial?.netWeight
  const weightGrams = weightLbs !== undefined ? Math.round(weightLbs * 453.592) : undefined

  // Dimensions: imperial inches → cm (1 in = 2.54 cm)
  const hasDims = imperial?.length || imperial?.width || imperial?.height
  const dimensionsCm = hasDims ? {
    length: imperial?.length !== undefined ? imperial.length * 2.54 : undefined,
    width: imperial?.width !== undefined ? imperial.width * 2.54 : undefined,
    height: imperial?.height !== undefined ? imperial.height * 2.54 : undefined,
  } : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.sku) ?? '',
    name: pickStr(raw.description) ?? pickStr(raw.sku) ?? '',
    description: pickStr(raw.description2),
    upc: pickStr(raw.upc) ?? pickStr(raw.options?.packageUnit?.upc),
    brand: undefined,
    category: pickStr(raw.inventoryCategory),
    unitOfMeasure: pickStr(unitName) ?? 'each',
    weightGrams,
    dimensionsCm,
    // price is the selling price; stored as float dollars — do NOT convert to minor units (schema stores as-is)
    retailPrice: raw.price !== undefined ? { amount: raw.price, currency: 'USD' } : undefined,
    isActive: !(raw.readOnly?.deactivated ?? false),
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.readOnly?.creationDate),
    updatedAt: toIso(raw.readOnly?.lastModifiedDate),
    platform: '3plcentral',
    metadata: strMap({
      inventoryCategory: raw.inventoryCategory,
      classificationId: raw.classificationIdentifier?.id,
      classificationName: raw.classificationIdentifier?.name,
      accountRef: raw.accountRef,
      countryOfManufacture: raw.countryOfManufacture,
      harmonizedCode: raw.harmonizedCode,
      reorderQty: raw.options?.inventoryUnit?.reorderQuantity,
    }),
    raw,
  }
}
