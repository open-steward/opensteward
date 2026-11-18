/**
 * Transform a raw Cheqroom item (equipment record) into the canonical Product schema.
 *
 * Cheqroom item fields (from CHECKROOM/checkroom_core_js):
 *   _id, name, status, brand, model, codes[], location, category,
 *   purchaseDate, purchasePrice, residualValue, warrantyDate,
 *   address, geo, cover, catalog, order, kit, custody, modified, created
 *
 * Schema-firewall: no cover/attachment URLs, no geo coordinates passed through.
 * Amounts: purchasePrice stored as-is (Cheqroom stores it as a decimal string or number;
 *          we surface it in metadata, not as a canonical price field, because currency is unknown).
 */
import type { Product } from '../../../schema/product'
import {pickStr, strMap, toIso} from './shared'

export interface RawCheqroomItem {
  _id: string
  name?: string
  status?: string
  brand?: string
  model?: string
  /** Array of QR/barcode code strings */
  codes?: Array<string | { code?: string; type?: string }>
  /** Location _id reference */
  location?: string | { _id?: string; name?: string }
  /** Category _id reference */
  category?: string | { _id?: string; name?: string }
  purchaseDate?: string | null
  purchasePrice?: number | string | null
  residualValue?: number | string | null
  warrantyDate?: string | null
  /** Flag whether item is archived/inactive */
  archived?: boolean
  /** Modified timestamp */
  modified?: string
  /** Created timestamp */
  created?: string
  [key: string]: unknown
}

function resolveRef(ref: string | { _id?: string; name?: string } | undefined): string | undefined {
  if (!ref) return undefined
  if (typeof ref === 'string') return ref || undefined
  return ref._id || undefined
}

function firstCode(codes: RawCheqroomItem['codes']): string | undefined {
  if (!codes || codes.length === 0) return undefined
  const first = codes[0]
  if (typeof first === 'string') return first || undefined
  return first?.code || undefined
}

export function transformProduct(raw: RawCheqroomItem): Product {
  const locationId = resolveRef(raw.location)
  const categoryId = resolveRef(raw.category)

  return {
    id: raw._id,
    externalId: raw._id,
    sku: '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    upc: firstCode(raw.codes),
    brand: pickStr(raw.brand),
    category: categoryId,
    unitOfMeasure: 'each',
    isActive: raw.archived !== true,
    supplierIds: [],
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.modified),
    platform: 'cheqroom',
    metadata: strMap({
      status: raw.status,
      model: raw.model,
      locationId,
      purchasePrice: raw.purchasePrice,
      residualValue: raw.residualValue,
      warrantyDate: raw.warrantyDate,
      purchaseDate: raw.purchaseDate,
    }),
    raw,
  }
}
