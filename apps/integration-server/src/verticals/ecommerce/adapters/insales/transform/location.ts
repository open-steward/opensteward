/**
 * InSales Warehouse → canonical Location.
 *
 * InSales exposes warehouses via `/admin/warehouses.json`. Each warehouse has
 * an id, title, address fields, and active flag.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

export interface RawInsalesWarehouse {
  id: number | string
  title?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  active?: boolean | null
  [key: string]: unknown
}

function mapAddress(raw: RawInsalesWarehouse): Address | undefined {
  const line1 = raw.address ?? undefined
  const city = raw.city ?? undefined
  if (!line1 && !city) return undefined
  return { line1, city }
}

export function transformWarehouse(raw: RawInsalesWarehouse): Location {
  return {
    id: String(raw.id),
    name: raw.title ?? `Warehouse ${raw.id}`,
    active: raw.active ?? undefined,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: raw.active !== false ? true : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Synthetic default location for stores where warehouse data is unavailable.
 */
export function syntheticDefaultLocation(): Location {
  return {
    id: 'default',
    name: 'Default Warehouse',
    active: true,
    isFulfillmentCenter: true,
    metadata: {},
  }
}
