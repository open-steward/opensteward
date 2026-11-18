import type { Warehouse } from '../../../schema/warehouse'

export interface ShipBobFulfillmentCenter {
  id: number
  name: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  timezone: string | null
  phone_number: string | null
  email: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: ShipBobFulfillmentCenter): Warehouse {
  const hasAddress = raw.address1 || raw.city || raw.state || raw.country
  return {
    id: String(raw.id),
    name: raw.name ?? undefined,
    address: hasAddress
      ? {
          street1: raw.address1 ?? undefined,
          street2: raw.address2 ?? undefined,
          city: raw.city ?? undefined,
          state: raw.state ?? undefined,
          postalCode: raw.zip_code ?? undefined,
          country: raw.country ?? undefined,
          phone: raw.phone_number ?? undefined,
          email: raw.email ?? undefined,
        }
      : undefined,
    isActive: true,
    timezone: raw.timezone ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
