import type { Warehouse } from '../../../schema/warehouse'
import { toISODate, toAddress } from '../../shared/transform'

export interface TrimbleTruckmateWarehouseAddressRaw {
  address?: string
  address2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  [key: string]: unknown
}

export interface TrimbleTruckmateWarehouseResponse {
  id?: string
  siteId?: string
  name?: string
  siteName?: string
  code?: string
  siteCode?: string
  address?: TrimbleTruckmateWarehouseAddressRaw
  location?: TrimbleTruckmateWarehouseAddressRaw
  isActive?: boolean
  active?: boolean
  timezone?: string
  cutoffTime?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformWarehouse(raw: TrimbleTruckmateWarehouseResponse): Warehouse {
  const id = raw.siteId ?? raw.id ?? undefined
  const addressRaw = raw.address ?? raw.location

  return {
    id,
    name: raw.siteName ?? raw.name ?? undefined,
    code: raw.siteCode ?? raw.code ?? undefined,
    address: addressRaw
      ? toAddress({
          street1: addressRaw.address,
          street2: addressRaw.address2,
          city: addressRaw.city,
          state: addressRaw.state,
          postalCode: addressRaw.zipCode,
          country: addressRaw.country,
        })
      : undefined,
    isActive: raw.isActive ?? raw.active ?? undefined,
    timezone: raw.timezone ?? undefined,
    cutoffTime: raw.cutoffTime ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
