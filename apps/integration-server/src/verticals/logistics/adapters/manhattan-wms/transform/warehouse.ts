import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'

export interface ManhattanWmsFacilityResponse {
  facilityId: string
  name?: string
  code?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  phone?: string
  email?: string
  isActive?: boolean
  timezone?: string
  cutoffTime?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformWarehouse(raw: ManhattanWmsFacilityResponse): Warehouse {
  const hasAddress = raw.address1 || raw.city || raw.state || raw.country
  return {
    id: raw.facilityId,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    address: hasAddress
      ? {
          street1: raw.address1 ?? undefined,
          street2: raw.address2 ?? undefined,
          city: raw.city ?? undefined,
          state: raw.state ?? undefined,
          postalCode: raw.zipCode ?? undefined,
          country: raw.country ?? undefined,
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
