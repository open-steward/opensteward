import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Shippify warehouse / depot object.
 */
export interface ShippifyWarehouse {
  id: string
  name?: string | null
  code?: string | null
  address?: Record<string, unknown> | null
  is_active?: boolean | null
  timezone?: string | null
  cutoff_time?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: ShippifyWarehouse): Warehouse {
  return {
    id: raw.id ?? undefined,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    address: toAddress(raw.address as Record<string, unknown> | null | undefined),
    isActive: raw.is_active ?? undefined,
    timezone: raw.timezone ?? undefined,
    cutoffTime: raw.cutoff_time ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
