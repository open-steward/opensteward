import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

export interface ShipmonkWarehouseAddress {
  name?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  street3?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  phone?: string | null
  residential?: boolean | null
  verified?: boolean | null
  country?: string | null
  [key: string]: unknown
}

export interface ShipmonkWarehouse {
  id?: number | string | null
  identifier?: string | null
  name?: string | null
  timezone?: string | null
  warehouse_wms_type?: string | null
  enabled?: boolean | null
  address?: ShipmonkWarehouseAddress | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface ShipmonkWarehouseListResponse {
  data?: ShipmonkWarehouse[]
  paginator?: unknown
  status?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: ShipmonkWarehouse): Warehouse {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    name: raw.name ?? undefined,
    code: raw.identifier ?? undefined,
    address: toAddress(raw.address as Record<string, unknown> | null | undefined),
    isActive: raw.enabled ?? undefined,
    timezone: raw.timezone ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
