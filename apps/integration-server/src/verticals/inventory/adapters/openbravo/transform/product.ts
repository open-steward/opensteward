/**
 * Openbravo Product → canonical Product.
 *
 * Entity: Product (table: M_Product)
 * Endpoint: /openbravo/org.openbravo.service.json.jsonrest/Product
 *
 * Key fields (Openbravo entity model):
 *   id, searchKey (SKU/internal code), name, description, uPC (EAN/barcode),
 *   productCategory._identifier, uOM._identifier, weight (kg), active (Y|N),
 *   productType, creationDate, updated
 *
 *   productPOList is an optional expansion containing purchase-price records
 *   which embed the linked supplier businessPartner IDs.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, pickBool, strMap, toIso} from './shared'

export interface RawOpenbravoProduct {
  /** UUID primary key */
  id: string
  /** Internal search key / SKU (stored in Value column) */
  searchKey?: string
  name?: string
  description?: string
  /** EAN-13 / UPC barcode */
  uPC?: string
  productCategory?: { id?: string; _identifier?: string }
  uOM?: { id?: string; _identifier?: string }
  productType?: string
  /** Weight in kg */
  weight?: number | string
  /** "Y" = active, "N" = inactive; also accepts boolean */
  active?: boolean | string
  creationDate?: string
  updated?: string
  /** Optional expansion: purchase-price records with linked supplier IDs */
  productPOList?: Array<{ businessPartner?: { id?: string } }>
  [key: string]: unknown
}

export function transformProduct(raw: RawOpenbravoProduct): Product {
  const supplierIds: string[] = []
  for (const po of raw.productPOList ?? []) {
    const bpId = po.businessPartner?.id
    if (bpId) supplierIds.push(bpId)
  }

  const weightKg = pickNum(raw.weight)

  return {
    id: raw.id,
    externalId: raw.id,
    sku: pickStr(raw.searchKey) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.uPC),
    category: pickStr(raw.productCategory?._identifier),
    unitOfMeasure: pickStr(raw.uOM?._identifier) ?? 'each',
    // Openbravo stores weight in kg; canonical schema wants grams
    weightGrams: weightKg !== undefined ? weightKg * 1000 : undefined,
    isActive: pickBool(raw.active) ?? true,
    supplierIds,
    createdAt: toIso(raw.creationDate),
    updatedAt: toIso(raw.updated),
    platform: 'openbravo',
    metadata: strMap({
      productType: raw.productType,
      categoryId: raw.productCategory?.id,
      uomId: raw.uOM?.id,
    }),
    raw,
  }
}
