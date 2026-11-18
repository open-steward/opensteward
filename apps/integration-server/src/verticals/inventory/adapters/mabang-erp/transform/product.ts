/**
 * Transform Mabang ERP do-search-stockSku / do-add-stock response into Product.
 *
 * Mabang field notes:
 *   stockId     — numeric ERP product identifier
 *   stockSku    — internal SKU (库存sku)
 *   nameCN      — Chinese product name
 *   nameEN      — English product name
 *   status      — 1=active, 2=inactive
 *   weight      — unit weight (kg, float string)
 *   declareCode — HS/customs code
 *   warehouseName — default warehouse name
 *   providerName  — default supplier name
 *   providerId    — default supplier ID
 *   salesSku    — parent/master SKU link
 *   labelId     — label / category tag
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawMabangProduct {
  stockId?: string | number
  stockSku?: string
  nameCN?: string
  nameEN?: string
  status?: string | number          // '1'=active, '2'=inactive
  weight?: string | number          // kg
  declareCode?: string
  warehouseName?: string
  warehouseCode?: string
  providerName?: string
  providerId?: string | number
  salesSku?: string
  labelId?: string | number
  timeCreated?: string
  timeUpdated?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawMabangProduct): Product {
  const id = String(raw.stockId ?? raw.stockSku ?? '')
  const weightKg = pickNum(raw.weight)

  return {
    id,
    externalId: id,
    sku: pickStr(raw.stockSku) ?? '',
    name: pickStr(raw.nameEN) ?? pickStr(raw.nameCN) ?? '',
    description: undefined,
    upc: pickStr(raw.declareCode),
    brand: undefined,
    category: undefined,
    unitOfMeasure: 'each',
    // Mabang stores weight in kg; convert to grams
    weightGrams: weightKg !== undefined ? weightKg * 1000 : undefined,
    dimensionsCm: undefined,
    retailPrice: undefined,
    isActive: String(raw.status) !== '2',
    parentProductId: pickStr(raw.salesSku),
    supplierIds: raw.providerId ? [String(raw.providerId)] : [],
    createdAt: toIso(raw.timeCreated),
    updatedAt: toIso(raw.timeUpdated),
    platform: 'mabang-erp',
    metadata: strMap({
      nameCN: raw.nameCN,
      warehouseName: raw.warehouseName,
      warehouseCode: raw.warehouseCode,
      providerName: raw.providerName,
      labelId: raw.labelId,
    }),
    raw,
  }
}
