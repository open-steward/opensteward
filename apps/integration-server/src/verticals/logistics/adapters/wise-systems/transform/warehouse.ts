import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw Wise Systems depot object as returned by GET /depot/{id} or GET /depots.
 * Depots are distribution centres / dispatch hubs — the closest concept to a
 * canonical Warehouse in Wise Systems' domain model.
 * Field names follow the documented API response schema.
 */
export interface WiseSystemsDepot {
  id: string
  name?: string | null
  code?: string | null
  active?: boolean | null
  timezone?: string | null
  client_id?: string | null
  address?: {
    id?: string | null
    address1?: string | null
    address2?: string | null
    city?: string | null
    state?: string | null
    postal_code?: string | null
    country?: string | null
    lat?: number | null
    lng?: number | null
    name?: string | null
    phone?: string | null
    [key: string]: unknown
  } | null
  created_at?: string | number | null
  updated_at?: string | number | null
  [key: string]: unknown
}

export function transformWarehouse(raw: WiseSystemsDepot): Warehouse {
  const addressRaw = raw.address
    ? {
        address1: raw.address.address1,
        address2: raw.address.address2,
        city: raw.address.city,
        state: raw.address.state,
        postal_code: raw.address.postal_code,
        country: raw.address.country,
        name: raw.address.name,
        phone: raw.address.phone,
      }
    : undefined

  return {
    id: raw.id,
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    address: toAddress(addressRaw),
    isActive: raw.active ?? undefined,
    timezone: raw.timezone ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
