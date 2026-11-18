import type { Warehouse } from '../../../schema/warehouse'

// ─── Shipwire raw types ────────────────────────────────────────────────────

export interface ShipwireWarehouse {
  id: number
  name: string | null
  code: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  timezone: string | null
  is_active: boolean | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformWarehouse(raw: ShipwireWarehouse): Warehouse {
  const hasAddress = raw.address1 || raw.city || raw.state || raw.country
  return {
    id: String(raw.id),
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    address: hasAddress
      ? {
          street1: raw.address1 ?? undefined,
          street2: raw.address2 ?? undefined,
          city: raw.city ?? undefined,
          state: raw.state ?? undefined,
          postalCode: raw.postal_code ?? undefined,
          country: raw.country ?? undefined,
        }
      : undefined,
    isActive: raw.is_active ?? undefined,
    timezone: raw.timezone ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
