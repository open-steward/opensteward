/**
 * Transform Infor WMS item (product) records.
 *
 * Infor WMS exposes items at /WMS/items (enterprise level). Key fields:
 *   itemNumber      — unique item identifier / SKU
 *   itemDescription — human-readable name
 *   unitOfMeasure   — base UOM (e.g. "EA", "CS")
 *   upc             — barcode / UPC
 *   itemClass       — category / class code
 *   inventoryType   — item type (FIFO, FEFO, LOT, etc.)
 *   activeFlag      — "Y" / "N"
 *   ownerCode       — owner/company code (Infor WMS is multi-owner)
 *   weight          — unit weight in lbs
 *   length/width/height — dimensions in inches
 *   createdDateTime / lastUpdatedDateTime — ISO timestamps
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawInforWmsItem {
  itemNumber: string
  itemDescription?: string
  itemDescription2?: string
  unitOfMeasure?: string
  upc?: string
  itemClass?: string
  itemSubClass?: string
  inventoryType?: string
  activeFlag?: string | boolean
  ownerCode?: string
  defaultWarehouse?: string
  weight?: number | string
  weightUom?: string
  length?: number | string
  width?: number | string
  height?: number | string
  dimensionUom?: string
  stdCost?: number | string
  retailPrice?: number | string
  currencyCode?: string
  hazmat?: string | boolean
  serializedFlag?: string | boolean
  lotControlled?: string | boolean
  createdDateTime?: string
  lastUpdatedDateTime?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawInforWmsItem): Product {
  const weightLbs = pickNum(raw.weight)
  // Convert lbs to grams: 1 lb = 453.592 g
  const weightGrams = weightLbs !== undefined ? weightLbs * 453.592 : undefined

  const length = pickNum(raw.length)
  const width = pickNum(raw.width)
  const height = pickNum(raw.height)

  const retailPriceNum = pickNum(raw.retailPrice)
  const currency = pickStr(raw.currencyCode) ?? 'USD'

  return {
    id: raw.itemNumber,
    externalId: raw.itemNumber,
    sku: raw.itemNumber,
    name: pickStr(raw.itemDescription) ?? raw.itemNumber,
    description: pickStr(raw.itemDescription2),
    upc: pickStr(raw.upc),
    brand: undefined,
    category: pickStr(raw.itemClass),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'EA',
    weightGrams,
    dimensionsCm: length || width || height ? {
      // Infor WMS stores in inches by default; convert to cm (1 in = 2.54 cm)
      length: length !== undefined ? length * 2.54 : undefined,
      width: width !== undefined ? width * 2.54 : undefined,
      height: height !== undefined ? height * 2.54 : undefined,
    } : undefined,
    retailPrice: retailPriceNum !== undefined ? { amount: retailPriceNum, currency } : undefined,
    isActive: pickBool(raw.activeFlag) ?? ((raw.activeFlag as string) !== 'N'),
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.createdDateTime),
    updatedAt: toIso(raw.lastUpdatedDateTime),
    platform: 'infor-wms',
    metadata: strMap({
      ownerCode: raw.ownerCode,
      inventoryType: raw.inventoryType,
      itemSubClass: raw.itemSubClass,
      defaultWarehouse: raw.defaultWarehouse,
      hazmat: raw.hazmat,
      serialized: raw.serializedFlag,
      lotControlled: raw.lotControlled,
    }),
    raw,
  }
}
