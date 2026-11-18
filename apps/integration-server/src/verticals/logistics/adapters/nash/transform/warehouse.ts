import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'

export interface NashStoreLocation {
  id?: string | null
  name?: string | null
  phoneNumber?: string | null
  location?: {
    address?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    country?: string | null
    lat?: number | null
    lng?: number | null
  } | null
  externalId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: NashStoreLocation): Warehouse {
  const loc = raw.location ?? {}
  return {
    id: raw.id ?? undefined,
    name: raw.name ?? undefined,
    code: raw.externalId ?? undefined,
    address: loc.address
      ? {
          street1: loc.address ?? undefined,
          city: loc.city ?? undefined,
          state: loc.state ?? undefined,
          postalCode: loc.zip ?? undefined,
          country: loc.country ?? undefined,
          phone: raw.phoneNumber ?? undefined,
        }
      : undefined,
    isActive: true,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
