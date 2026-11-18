/**
 * Transform Boxstorm part → canonical Product.
 *
 * Boxstorm (Fishbowl Advanced) parts endpoint: GET /api/parts
 * Response envelope: { totalCount, totalPages, pageNumber, pageSize, results: RawBoxstormPart[] }
 *
 * Individual part fields reflect the Fishbowl Advanced REST API schema.
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

export interface RawBoxstormPart {
  /** Numeric primary key returned as integer */
  id: number | string
  /** Part number / SKU */
  number?: string
  description?: string
  /** Detailed description */
  details?: string
  upc?: string
  /** Part type: Inventory | Service | Labor | Overhead | Non-Inventory | Internal Use | Capital Equipment | Shipping */
  type?: string
  /** ABC classification code */
  abc?: string
  /** Whether a BOM exists */
  hasBom?: boolean
  /** Whether the part tracks serial numbers */
  tracksSerialNumbers?: boolean
  hasTracking?: boolean
  active?: boolean
  /** Unit of measure object */
  uom?: { id?: number | string; name?: string; abbreviation?: string }
  /** Associated product number */
  productNumber?: string
  productDescription?: string
  /** Default vendor part number */
  vendorPartNumber?: string
  /** Timestamp strings (ISO-8601 or similar) */
  dateCreated?: string
  dateLastModified?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawBoxstormPart): Product {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    sku: pickStr(raw.number) ?? '',
    name: pickStr(raw.description) ?? pickStr(raw.number) ?? '',
    description: pickStr(raw.details),
    upc: pickStr(raw.upc),
    unitOfMeasure: raw.uom?.abbreviation ?? raw.uom?.name ?? 'each',
    isActive: pickBool(raw.active) ?? true,
    supplierIds: [],
    createdAt: toIso(raw.dateCreated),
    updatedAt: toIso(raw.dateLastModified),
    platform: 'boxstorm',
    metadata: strMap({
      type: raw.type,
      abc: raw.abc,
      hasBom: raw.hasBom,
      tracksSerialNumbers: raw.tracksSerialNumbers,
      hasTracking: raw.hasTracking,
      productNumber: raw.productNumber,
      vendorPartNumber: raw.vendorPartNumber,
    }),
    raw,
  }
}
