import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'
import { transformAddress, type SSAddress } from './address'

export interface SSWarehouse {
  warehouseId: number
  warehouseName: string
  originAddress: SSAddress | null
  returnAddress: SSAddress | null
  createDate: string
  isDefault: boolean
  [key: string]: unknown
}

export function transformWarehouse(raw: SSWarehouse): Warehouse {
  return {
    id: String(raw.warehouseId),
    name: raw.warehouseName || undefined,
    address: transformAddress(raw.originAddress),
    isActive: true,
    createdAt: toISODate(raw.createDate),
    metadata: raw as Record<string, unknown>,
  }
}
