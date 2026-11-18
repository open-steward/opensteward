import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'
import { transformAddress, type ShipEngineAddress } from './address'

export interface ShipEngineWarehouse {
  warehouse_id: string
  name?: string | null
  created_at?: string | null
  origin_address?: ShipEngineAddress | null
  return_address?: ShipEngineAddress | null
  [key: string]: unknown
}

export function transformWarehouse(raw: ShipEngineWarehouse): Warehouse {
  return {
    id: raw.warehouse_id,
    name: raw.name ?? undefined,
    address: raw.origin_address
      ? transformAddress(raw.origin_address)
      : undefined,
    isActive: true,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
