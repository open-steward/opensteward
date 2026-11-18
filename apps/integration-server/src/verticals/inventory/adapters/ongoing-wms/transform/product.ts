/**
 * Transform Ongoing WMS article response → canonical Product.
 *
 * GET /articles or GET /articles/{articleSystemId}
 * Real field names sourced from the Ongoing WMS Goods Owner REST API OpenAPI spec.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

interface ArticleGroup {
  code?: string
  name?: string
}

interface ArticleCategory {
  code?: string
  name?: string
}

interface InventoryInfo {
  numberOfItems?: number
  numberOfBookedItems?: number
  numberOfLockedItems?: number
  toReceiveNumberOfItems?: number
  allocatedNumberOfItems?: number
  lockedForSaleNumberOfItems?: number
  pickedToBeCollectedNumberOfItems?: number
  receivedToBeFinishedNumberOfItems?: number
  lastInDate?: string
  sellableNumberOfItems?: number
}

interface BarCodeInfo {
  barCode?: string
  barCodePackage?: string
  barCodePallet?: string
}

interface SupplierInfo {
  supplierArticleNumber?: string
  supplierNumber?: string
  supplierName?: string
}

export interface RawOngoingWmsArticle {
  /** Ongoing WMS internal article id */
  articleSystemId?: number
  /** Goods-owner-facing article number */
  articleNumber?: string
  articleName?: string
  productCode?: string
  description?: string
  unitCode?: string
  isStockArticle?: boolean
  isObsolete?: boolean
  weight?: number
  length?: number
  width?: number
  height?: number
  volume?: number
  purchasePrice?: number
  customerPrice?: number
  purcaseCurrencyCode?: string
  countryOfOriginCode?: string
  barCodeInfo?: BarCodeInfo
  supplierInfo?: SupplierInfo
  articleGroup?: ArticleGroup
  articleCategory?: ArticleCategory
  inventoryInfo?: InventoryInfo
  quantityPerPackage?: number
  quantityPerPallet?: number
  statisticsNumber?: string
  /** From GET /articles response envelope */
  goodsOwner?: { id?: number; name?: string }
  [key: string]: unknown
}

export function transformProduct(raw: RawOngoingWmsArticle): Product {
  const articleId = String(raw.articleSystemId ?? raw.articleNumber ?? '')
  const suppliers: string[] = []
  if (raw.supplierInfo?.supplierNumber) suppliers.push(raw.supplierInfo.supplierNumber)

  return {
    id: articleId,
    externalId: articleId,
    sku: pickStr(raw.articleNumber) ?? '',
    name: pickStr(raw.articleName) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.barCodeInfo?.barCode),
    brand: undefined,
    category: pickStr(raw.articleCategory?.name ?? raw.articleCategory?.code),
    unitOfMeasure: pickStr(raw.unitCode) ?? 'each',
    // Ongoing WMS weight is in kg; convert to grams
    weightGrams: raw.weight !== undefined ? raw.weight * 1000 : undefined,
    dimensionsCm: raw.length || raw.width || raw.height
      ? { length: raw.length, width: raw.width, height: raw.height }
      : undefined,
    // customerPrice is the sales price; stored as-is (no currency conversion)
    retailPrice: raw.customerPrice !== undefined
      ? { amount: raw.customerPrice, currency: pickStr(raw.purcaseCurrencyCode) ?? 'USD' }
      : undefined,
    isActive: !pickBool(raw.isObsolete),
    parentProductId: undefined,
    supplierIds: suppliers,
    createdAt: toIso(raw.inventoryInfo?.lastInDate),
    updatedAt: undefined,
    platform: 'ongoing-wms',
    metadata: strMap({
      productCode: raw.productCode,
      articleGroup: raw.articleGroup?.code,
      articleGroupName: raw.articleGroup?.name,
      countryOfOriginCode: raw.countryOfOriginCode,
      statisticsNumber: raw.statisticsNumber,
      isStockArticle: raw.isStockArticle,
    }),
    raw,
  }
}
