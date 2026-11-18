import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

export interface DaVinciWarehouse {
  WarehouseId?: string | number | null
  WarehouseCode?: string | null
  WarehouseName?: string | null
  IsActive?: boolean | null
  Timezone?: string | null
  CutoffTime?: string | null
  Address?: Record<string, unknown> | null
  CreatedDate?: string | null
  ModifiedDate?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: DaVinciWarehouse): Warehouse {
  return {
    id: raw.WarehouseId != null ? String(raw.WarehouseId) : undefined,
    name: raw.WarehouseName ?? undefined,
    code: raw.WarehouseCode ?? undefined,
    address: toAddress(raw.Address),
    isActive: raw.IsActive ?? undefined,
    timezone: raw.Timezone ?? undefined,
    cutoffTime: raw.CutoffTime ?? undefined,
    createdAt: toISODate(raw.CreatedDate),
    updatedAt: toISODate(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
