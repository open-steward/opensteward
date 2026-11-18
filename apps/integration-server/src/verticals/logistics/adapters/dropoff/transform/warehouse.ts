import type { Warehouse } from '../../../schema/warehouse'
import { toISODate, toAddress } from '../../shared/transform'

export interface DropoffFacility {
  facility_id?: string | null
  facility_name?: string | null
  facility_code?: string | null
  is_active?: boolean | null
  timezone?: string | null
  address?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

export interface DropoffFacilityListResponse {
  success?: boolean
  data?: DropoffFacility[]
  [key: string]: unknown
}

export function transformWarehouse(raw: DropoffFacility): Warehouse {
  return {
    id: raw.facility_id ?? undefined,
    name: raw.facility_name ?? undefined,
    code: raw.facility_code ?? undefined,
    address: raw.address ? toAddress(raw.address) : undefined,
    isActive: raw.is_active ?? true,
    timezone: raw.timezone ?? undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformWarehouseList(raws: DropoffFacility[]): Warehouse[] {
  return raws.map(transformWarehouse)
}
