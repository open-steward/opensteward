/**
 * Shoper Warehouse → canonical Location.
 *
 * Shoper exposes warehouses (stock locations) under:
 *   GET /webapi/rest/warehouses[/{id}]
 *
 * Each warehouse has a name, address details, and an active flag.
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw Shoper shapes ────────────────────────────────────────────────────────

export interface RawShoperWarehouse {
  warehouse_id?: number | string
  name?: string | null
  default?: boolean | number | null
  /** Whether the warehouse is active. */
  active?: boolean | number | null
  street?: string | null
  apartment?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawShoperWarehouse): Address | undefined {
  const line1 = raw.street ?? undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.apartment ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawShoperWarehouse): Location {
  return {
    id: String(raw.warehouse_id ?? 'default'),
    name: raw.name ?? String(raw.warehouse_id ?? 'Default Warehouse'),
    active: raw.active != null ? Boolean(raw.active) : true,
    address: mapAddress(raw),
    phone: raw.phone ?? undefined,
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
