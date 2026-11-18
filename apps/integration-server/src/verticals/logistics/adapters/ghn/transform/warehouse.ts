import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'

// GHN Get Store response shape
// POST /shiip/public-api/v2/shop/all
// Response: { code, message, data: { shops: GhnShopRaw[], total: number } }
export interface GhnShopRaw {
  _id?: number | null
  name?: string | null
  phone?: string | null
  address?: string | null
  ward_code?: string | null
  district_id?: number | null
  status?: number | null
  updated_date?: string | null
  created_date?: string | null
  [key: string]: unknown
}

export interface GhnShopListResponse {
  shops?: GhnShopRaw[]
  total?: number
  /** "Offset cursor for the next page": the next request's `offset`. */
  last_offset?: number
  [key: string]: unknown
}

export function transformWarehouse(raw: GhnShopRaw): Warehouse {
  return {
    id: raw._id != null ? String(raw._id) : '',
    name: raw.name ?? undefined,
    address: (raw.address || raw.ward_code || raw.district_id != null)
      ? {
          street1: raw.address ?? undefined,
          postalCode: raw.ward_code ?? undefined,
          phone: raw.phone ?? undefined,
        }
      : undefined,
    isActive: raw.status === 1 || raw.status === undefined,
    createdAt: toISODate(raw.created_date),
    updatedAt: toISODate(raw.updated_date),
    metadata: raw as Record<string, unknown>,
  }
}
