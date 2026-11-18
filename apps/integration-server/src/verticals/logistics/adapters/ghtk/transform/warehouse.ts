import type { Warehouse } from '../../../schema/warehouse'

// GET /services/shipment/list_pick_add
// Response: { success: boolean, message: string, data: GhtkPickAddressRaw[] }
export interface GhtkPickAddressRaw {
  pick_address_id?: string | number | null
  address?: string | null
  pick_tel?: string | null
  pick_name?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: GhtkPickAddressRaw): Warehouse {
  return {
    id: raw.pick_address_id != null ? String(raw.pick_address_id) : undefined,
    name: raw.pick_name ?? undefined,
    address: raw.address
      ? {
          street1: raw.address,
          phone: raw.pick_tel ?? undefined,
          name: raw.pick_name ?? undefined,
        }
      : undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
