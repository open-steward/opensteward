/**
 * TikTok Shop warehouse → canonical Location.
 *
 * TikTok Shop exposes seller warehouses through the Logistics API.
 * Each warehouse has an id, name, address, and an `effect_status`
 * that indicates whether it is active.
 *
 * Endpoint: GET /logistics/202309/warehouses
 * Docs: https://partner.tiktokshop.com/docv2/page/finance-api-overview
 *
 * effect_status values:
 *   ACTIVE = warehouse is live and usable
 *   INACTIVE = warehouse is deactivated
 */

import type { Location } from '../../../schema/location'
import type { Address } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawTikTokWarehouseAddress {
  address_line1?: string
  address_line2?: string
  address_line3?: string
  address_line4?: string
  city?: string
  district?: string
  state?: string
  postal_code?: string
  region?: string
  [key: string]: unknown
}

export interface RawTikTokWarehouse {
  id: string
  name?: string
  effect_status?: string
  address?: RawTikTokWarehouseAddress
  contact_person?: string
  phone_number?: string
  is_default?: boolean
  type?: string
  sub_type?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawTikTokWarehouseAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 =
    [raw.address_line1, raw.address_line2].filter(Boolean).join(', ') || undefined
  const line2 =
    [raw.address_line3, raw.address_line4].filter(Boolean).join(', ') || undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? raw.district ?? raw.region ?? undefined
  const postalCode = raw.postal_code ?? undefined
  if (!line1 && !city && !postalCode) return undefined
  return { line1, line2, city, region, postalCode }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformLocation(raw: RawTikTokWarehouse): Location {
  const active = raw.effect_status
    ? raw.effect_status.toUpperCase() === 'ACTIVE'
    : undefined

  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    active,
    address: mapAddress(raw.address),
    phone: raw.phone_number ?? undefined,
    // TikTok Shop warehouses are fulfillment centres by definition
    isFulfillmentCenter: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
