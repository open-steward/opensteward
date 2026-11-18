/**
 * Transform a raw Shopware 5 article-detail object (GET /api/articles or /api/articles/{id})
 * into the canonical Product schema.
 *
 * Shopware 5 article response fields (relevant subset):
 *   id (integer), mainDetailId (integer),
 *   name (string), description (string), descriptionLong (string),
 *   taxId (integer), supplierId (integer), supplierName (string),
 *   active (boolean), highlight (boolean),
 *   lastStock (boolean — stop selling when stock = 0),
 *   mainDetail: {
 *     id, articleId, number (SKU), ean, weight, width, height, len,
 *     active, inStock, stockMin, purchasePrice
 *   },
 *   images: [...]   — schema-firewall: not mapped
 *   configuratorSet, variants — not mapped (BOM firewall)
 *   added (timestamp), changed (timestamp)
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

interface RawPickwareArticleDetail {
  id?: number | string
  number?: string
  ean?: string
  weight?: number
  width?: number
  height?: number
  len?: number
  active?: boolean
  inStock?: number
  stockMin?: number
  purchasePrice?: number
  [key: string]: unknown
}

export interface RawPickwareArticle {
  id: number | string
  mainDetailId?: number | string
  name?: string
  description?: string
  descriptionLong?: string
  taxId?: number | string
  supplierId?: number | string
  supplierName?: string
  active?: boolean
  lastStock?: boolean
  mainDetail?: RawPickwareArticleDetail
  added?: string
  changed?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawPickwareArticle): Product {
  const id = String(raw.id)
  const detail = raw.mainDetail ?? {}

  // Weight: Shopware stores in kg; convert to grams.
  const weightGrams = pickNum(detail.weight) !== undefined
    ? (detail.weight as number) * 1000
    : undefined

  return {
    id,
    externalId: id,
    sku: pickStr(detail.number) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description) ?? pickStr(raw.descriptionLong),
    upc: pickStr(detail.ean),
    unitOfMeasure: 'each',
    weightGrams,
    dimensionsCm: (detail.width || detail.height || detail.len) ? {
      length: pickNum(detail.len),
      width: pickNum(detail.width),
      height: pickNum(detail.height),
    } : undefined,
    isActive: pickBool(raw.active) ?? true,
    supplierIds: raw.supplierId ? [String(raw.supplierId)] : [],
    createdAt: toIso(raw.added),
    updatedAt: toIso(raw.changed),
    platform: 'pickware',
    metadata: strMap({
      supplierName: raw.supplierName,
      lastStock: raw.lastStock,
      taxId: raw.taxId,
    }),
    raw,
  }
}
