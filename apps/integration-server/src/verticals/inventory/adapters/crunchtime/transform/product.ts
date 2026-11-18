/**
 * Transform Crunchtime Company Product Enhanced → canonical Product.
 *
 * Source: GET /companyproduct/v1/getAllCompanyProductsEnhanced
 *         GET /companyproduct/v1/getCompanyProductsEnhancedByPage
 *
 * Key Crunchtime field names (camelCase JSON returned by the API):
 *   productNumber, productName, productDescription, universalProductCode,
 *   category, subCategory, microCategory, concept, activeFlag,
 *   lastEditDate, createDate, lastEditUser, defaultVendorCode
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawCrunchtimeProduct {
  productNumber: string
  productName?: string
  productDescription?: string
  universalProductCode?: string
  category?: string
  subCategory?: string
  microCategory?: string
  concept?: string
  activeFlag?: boolean | string
  defaultVendorCode?: string
  unitOfMeasure?: string
  createDate?: string
  lastEditDate?: string
  lastEditUser?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawCrunchtimeProduct): Product {
  return {
    id: raw.productNumber,
    externalId: raw.productNumber,
    sku: pickStr(raw.productNumber) ?? '',
    name: pickStr(raw.productName) ?? '',
    description: pickStr(raw.productDescription),
    upc: pickStr(raw.universalProductCode),
    brand: undefined,
    category: pickStr(raw.category),
    unitOfMeasure: pickStr(raw.unitOfMeasure) ?? 'each',
    isActive: pickBool(raw.activeFlag) ?? true,
    supplierIds: raw.defaultVendorCode ? [raw.defaultVendorCode] : [],
    createdAt: toIso(raw.createDate),
    updatedAt: toIso(raw.lastEditDate),
    platform: 'crunchtime',
    metadata: strMap({
      subCategory: raw.subCategory,
      microCategory: raw.microCategory,
      concept: raw.concept,
      lastEditUser: raw.lastEditUser,
    }),
    raw,
  }
}
