/**
 * EZO inventory item transform.
 *
 * EZO models "inventory" as volatile assets (consumables / tracked quantities).
 * List endpoint: GET /api/v2/inventory  → { inventory: [...] }
 * Single:        GET /api/v2/inventory/:id → { inventory: {...} }
 *
 * Key EZO v2 response fields (snake_case):
 *   id, name, sequence_num, group_name, group_id, sub_group_id,
 *   location_id, location_name, description, identifier,
 *   state (lifecycle), available_quantity, net_quantity,
 *   cost_price, purchased_on, created_at, updated_at,
 *   custom_fields (object)
 */
import type { Product } from '../../../schema/product'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawEZOInventory {
  id: number | string
  name?: string
  sequence_num?: string
  description?: string
  identifier?: string
  group_id?: number | string
  group_name?: string
  sub_group_id?: number | string
  location_id?: number | string
  location_name?: string
  /** EZO v2 uses "state" (not "status") for lifecycle state */
  state?: string
  /** available_quantity is the in-stock figure; net_quantity includes reserved */
  available_quantity?: number | string
  net_quantity?: number | string
  /** cost_price is the per-unit cost field in EZO v2 */
  cost_price?: number | string
  purchased_on?: string
  created_at?: string
  updated_at?: string
  custom_attributes?: Record<string, unknown>
  [key: string]: unknown
}

export function transformProduct(raw: RawEZOInventory): Product {
  const idStr = String(raw.id)
  // cost_price is the per-unit cost in EZO v2; store as integer minor units (cents).
  const rawCost = pickNum(raw.cost_price)
  const priceMinor = rawCost !== undefined ? Math.round(rawCost * 100) : undefined

  return {
    id: idStr,
    externalId: idStr,
    sku: pickStr(raw.sequence_num) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    upc: pickStr(raw.identifier),
    brand: undefined,
    category: pickStr(raw.group_name),
    unitOfMeasure: 'each',
    weightGrams: undefined,
    dimensionsCm: undefined,
    retailPrice: priceMinor !== undefined ? { amount: priceMinor, currency: 'USD' } : undefined,
    // EZO v2 uses "state" (not "status") for lifecycle; "retired" means inactive
    isActive: (raw.state ?? 'active') !== 'retired',
    parentProductId: undefined,
    supplierIds: [],
    createdAt: toIso(raw.created_at) ?? toIso(raw.purchased_on),
    updatedAt: toIso(raw.updated_at),
    platform: 'ezofficeinventory',
    metadata: strMap({
      groupId: raw.group_id,
      groupName: raw.group_name,
      subGroupId: raw.sub_group_id,
      locationId: raw.location_id,
      locationName: raw.location_name,
      state: raw.state,
    }),
    raw,
  }
}
