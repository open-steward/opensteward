import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'

// ─── Packlink PRO raw types ─────────────────────────────────────────────────────
// Source: GET v1/clients/warehouses. Fields are the ones Packlink's own
// integration core reads (packlink-dev/ecommerce_module_core,
// src/BusinessLogic/Warehouse/Warehouse.php): id, city, name, surname, phone,
// country, company, email, alias, address, postal_code, default_selection.
// Example body: that repo's tests/BusinessLogic/Common/ApiResponses/warehouses.json.

export interface PacklinkProWarehouse {
  id?: string | null
  alias?: string | null
  name?: string | null
  surname?: string | null
  company?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  postal_code?: string | null
  phone?: string | null
  email?: string | null
  default_selection?: boolean | null
  [key: string]: unknown
}

const s = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformWarehouse(raw: PacklinkProWarehouse): Warehouse {
  // Warehouse::fromArray: `$zipCity = explode(' - ', postal_code)`; a two-part
  // value is zip and city, otherwise postal_code is the zip alone.
  let postalCode = s(raw.postal_code)
  let city = s(raw.city)
  const zipCity = postalCode?.split(' - ')
  if (zipCity && zipCity.length === 2) {
    postalCode = s(zipCity[0])
    city = s(zipCity[1])
  }

  const contact = [s(raw.name), s(raw.surname)].filter(Boolean).join(' ')
  const country = s(raw.country)
  const address: Address = {
    name: contact || undefined,
    company: s(raw.company),
    street1: s(raw.address),
    city,
    postalCode,
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    phone: s(raw.phone),
    email: s(raw.email),
  }
  const hasAddress = Object.values(address).some((v) => v !== undefined)

  // default_selection marks the default ship-from, not an active flag, and
  // created_at ("2018-11-08 15:44:21") carries no zone: both stay in metadata.
  return {
    id: s(raw.id),
    name: s(raw.alias),
    address: hasAddress
      ? (Object.fromEntries(Object.entries(address).filter(([, v]) => v !== undefined)) as Address)
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
