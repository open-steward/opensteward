import type { Product } from '../../../schema/product'
import {pickStr, pickNum, strMap, pickMultiLang, type MultiLanguageString} from './shared'

/** Billbee stock-per-warehouse entry embedded in the article */
export interface BillbeeStockArticle {
  Name?: string
  StockId?: number
  StockCurrent?: number
  StockWarning?: number
  StockCode?: string
  UnfulfilledAmount?: number
  StockDesired?: number
  StockCurrentIsCalculated?: boolean
}

/** Billbee category model */
export interface BillbeeArticleCategory {
  Id?: number
  Name?: string
}

export interface RawBillbeeProduct {
  /** Billbee internal article ID (int64) */
  Id?: number
  /** Merchant SKU */
  SKU?: string
  /** EAN/barcode */
  EAN?: string
  /** Product title — multilingual array */
  Title?: MultiLanguageString[]
  /** Long description — multilingual array */
  Description?: MultiLanguageString[]
  /** Short description — multilingual array */
  ShortDescription?: MultiLanguageString[]
  /** Retail/gross price */
  Price?: number
  /** Net cost price */
  CostPrice?: number
  /** Weight in grams */
  Weight?: number
  /** Net weight in grams */
  WeightNet?: number
  /** Dimensions */
  LengthCm?: number
  WidthCm?: number
  HeightCm?: number
  /** Stock levels per warehouse */
  Stocks?: BillbeeStockArticle[]
  /** Aggregate current stock (primary warehouse) */
  StockCurrent?: number
  StockDesired?: number
  StockWarning?: number
  StockCode?: string
  /** Whether the product is deactivated */
  IsDeactivated?: boolean
  /** Whether stock is calculated (virtual) */
  LowStock?: boolean
  Manufacturer?: string
  Category1?: BillbeeArticleCategory
  Category2?: BillbeeArticleCategory
  Category3?: BillbeeArticleCategory
  /** Product type code */
  Type?: number
  VatIndex?: number
  [key: string]: unknown
}

export function transformProduct(raw: RawBillbeeProduct): Product {
  const id = String(raw.Id ?? '')
  const title = pickMultiLang(raw.Title) ?? ''
  const description = pickMultiLang(raw.Description) ?? pickMultiLang(raw.ShortDescription)

  const categories: string[] = []
  if (raw.Category1?.Name) categories.push(raw.Category1.Name)
  if (raw.Category2?.Name) categories.push(raw.Category2.Name)
  if (raw.Category3?.Name) categories.push(raw.Category3.Name)

  // Billbee Weight field is already in grams
  const weightGrams = pickNum(raw.Weight)

  const hasDims = raw.LengthCm || raw.WidthCm || raw.HeightCm
  const dimensionsCm = hasDims
    ? { length: raw.LengthCm, width: raw.WidthCm, height: raw.HeightCm }
    : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(raw.SKU) ?? '',
    name: title,
    description,
    upc: pickStr(raw.EAN),
    brand: pickStr(raw.Manufacturer),
    category: categories.length > 0 ? categories.join(' > ') : undefined,
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm,
    retailPrice: raw.Price !== undefined ? { amount: raw.Price, currency: 'EUR' } : undefined,
    isActive: !(raw.IsDeactivated ?? false),
    supplierIds: [],
    platform: 'billbee',
    metadata: strMap({
      stockCode: raw.StockCode,
      vatIndex: raw.VatIndex,
      type: raw.Type,
      lowStock: raw.LowStock,
    }),
    raw,
  }
}
