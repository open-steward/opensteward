import type { Product } from '../../../schema/product'
import {pickStr, pickBool, strMap, toIso} from './shared'

/**
 * Raw asset record returned by GET /assets or GET /assets/:id from the
 * GoCodes REST API.  Field names are camelCase as returned by the API.
 */
export interface RawGocodesAsset {
  /** Asset primary key — the GoCodes internal ID (UUID or numeric string). */
  id: string
  /** Human-readable asset tag / code (the scanned QR/barcode value). */
  asset_tag?: string
  /** Display name for the asset. */
  name?: string
  /** Longer description. */
  description?: string
  /** Asset category label. */
  category?: string
  /** Asset sub-category label. */
  subcategory?: string
  /** Serial number. */
  serial_number?: string
  /** Current assigned location ID. */
  location_id?: string
  /** Current assigned location name. */
  location_name?: string
  /** Whether the asset is active / in service. */
  active?: boolean | string
  /** Purchase/acquisition cost in the account's currency (decimal dollars). */
  purchase_cost?: number | string
  /** ISO 4217 currency code for monetary values. Defaults to USD. */
  currency?: string
  /** ISO 8601 date when the asset was created in GoCodes. */
  created_at?: string
  /** ISO 8601 date of last modification. */
  updated_at?: string
  [key: string]: unknown
}

export function transformProduct(raw: RawGocodesAsset): Product {
  // purchase_cost is stored as decimal dollars; convert to integer minor units (cents).
  let retailPrice: { amount: number; currency: string } | undefined
  const costRaw = raw.purchase_cost
  if (costRaw !== undefined && costRaw !== null && costRaw !== '') {
    const costDollars = typeof costRaw === 'number' ? costRaw : parseFloat(String(costRaw))
    if (!Number.isNaN(costDollars)) {
      retailPrice = {
        amount: Math.round(costDollars * 100),
        currency: pickStr(raw.currency) ?? 'USD',
      }
    }
  }

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    sku: pickStr(raw.asset_tag) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.serial_number),
    brand: undefined,
    category: pickStr(raw.category),
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice,
    isActive: pickBool(raw.active) ?? true,
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'gocodes',
    metadata: strMap({ subcategory: raw.subcategory, location_id: raw.location_id, location_name: raw.location_name }),
    raw,
  }
}
