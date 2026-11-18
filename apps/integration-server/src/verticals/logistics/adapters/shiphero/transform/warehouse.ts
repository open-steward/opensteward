import type { Warehouse } from '../../../schema/warehouse'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Warehouse as returned by account.data.warehouses[] in ShipHero's GraphQL API.
 * Source: https://developer.shiphero.com/ — account query.
 */
export interface ShipheroWarehouse {
  id: string
  legacy_id?: number | null
  identifier?: string | null
  address?: Record<string, unknown> | null
  phone_number?: string | null
  invoice_email?: string | null
  profile?: string | null
  dynamic_slotting?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: ShipheroWarehouse): Warehouse {
  return {
    id: raw.id,
    name: raw.identifier ?? undefined,
    code: raw.identifier ?? undefined,
    address: toAddress(raw.address),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
