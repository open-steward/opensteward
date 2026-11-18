import type { Warehouse } from '../../../schema/warehouse'

/**
 * One row of GET /get-warehouses `data`, as the API documentation PDF's
 * "Response Fields" list it. `country` is a name ("India"), not an ISO code,
 * so it stays in metadata only.
 */
export interface ShipMozoWarehouse {
  id?: number | string | null
  default?: string | null
  address_title?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  alt_phone?: string | null
  address_line_one?: string | null
  address_line_two?: string | null
  pincode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  status?: string | null
}

function text(v: string | null | undefined): string | undefined {
  return v == null || v === '' ? undefined : v
}

/** status: "Current status of the warehouse (e.g., "ACTIVE", "INACTIVE")." */
function active(status: string | null | undefined): boolean | undefined {
  if (status === 'ACTIVE') return true
  if (status === 'INACTIVE') return false
  return undefined
}

export function transformWarehouse(raw: ShipMozoWarehouse): Warehouse {
  if (raw.id == null || raw.id === '') {
    throw new Error('Shipmozo warehouse row has no id')
  }
  return {
    id: String(raw.id),
    name: text(raw.address_title),
    isActive: active(raw.status),
    address: {
      name: text(raw.name),
      street1: text(raw.address_line_one),
      street2: text(raw.address_line_two),
      city: text(raw.city),
      state: text(raw.state),
      postalCode: text(raw.pincode),
      phone: text(raw.phone),
      email: text(raw.email),
    },
    metadata: raw as Record<string, unknown>,
  }
}
