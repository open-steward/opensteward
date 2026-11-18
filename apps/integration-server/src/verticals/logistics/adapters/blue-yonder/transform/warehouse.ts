import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'

export interface BlueYonderWarehouseResponse {
  warehouseId: string
  name?: string
  code?: string
  streetAddress?: string
  streetAddress2?: string
  city?: string
  stateOrProvince?: string
  postalCode?: string
  countryCode?: string
  phone?: string
  email?: string
  isActive?: boolean
  timezone?: string
  cutoffTime?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformWarehouse(raw: BlueYonderWarehouseResponse): Warehouse {
  const hasAddress =
    raw.streetAddress || raw.city || raw.stateOrProvince || raw.postalCode || raw.countryCode

  return {
    id: raw.warehouseId,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    address: hasAddress
      ? {
          street1: raw.streetAddress ?? undefined,
          street2: raw.streetAddress2 ?? undefined,
          city: raw.city ?? undefined,
          state: raw.stateOrProvince ?? undefined,
          postalCode: raw.postalCode ?? undefined,
          country: raw.countryCode ?? undefined,
          phone: raw.phone ?? undefined,
          email: raw.email ?? undefined,
        }
      : undefined,
    isActive: raw.isActive ?? true,
    timezone: raw.timezone ?? undefined,
    cutoffTime: raw.cutoffTime ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
