import { toIsoDatetime } from '@opensteward/shared'
import type { Warehouse } from '../../../schema/warehouse'
import { toAddress } from '../../shared/transform'

export interface ElogiiDepot {
  _id: string
  name?: string | null
  address?: {
    formatted_address?: string | null
    name?: string | null
    street?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    postcode?: string | null
    zip_code?: string | null
  } | null
  latitude?: number | null
  longitude?: number | null
  phone?: string | null
  email?: string | null
  isActive?: boolean | null
  timezone?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: ElogiiDepot): Warehouse {
  const addr = raw.address ?? {}
  return {
    id: raw._id,
    name: raw.name ?? undefined,
    address: toAddress({
      street1: addr.street ?? null,
      city: addr.city ?? null,
      state: addr.state ?? null,
      country: addr.country ?? null,
      postalCode: addr.postcode ?? addr.zip_code ?? null,
      phone: raw.phone ?? null,
      email: raw.email ?? null,
    }),
    isActive: raw.isActive ?? undefined,
    timezone: raw.timezone ?? undefined,
    createdAt: raw.createdAt && toIsoDatetime(raw.createdAt)
      ? new Date(toIsoDatetime(raw.createdAt)!)
      : undefined,
    updatedAt: raw.updatedAt && toIsoDatetime(raw.updatedAt)
      ? new Date(toIsoDatetime(raw.updatedAt)!)
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
