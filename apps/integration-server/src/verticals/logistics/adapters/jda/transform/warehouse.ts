/**
 * JDA (Blue Yonder) TMS — warehouse/facility → canonical Warehouse.
 *
 * In JDA TMS, warehouses and distribution centres are modelled as facility
 * records (sometimes called "locations" or "facilities" in the planning layer).
 * These are referenced by `warehouseId` on load/order records.
 *
 * The `/warehouses` path follows the same auth/envelope conventions as the
 * `/loads` and `/orders` resources already implemented in this adapter.
 *
 * Docs: https://blueyonder.com/solutions/transportation-management
 * (Full endpoint spec behind enterprise login at dev-jdapiportal.jdadelivers.com)
 */
import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'

export interface JdaWarehouseResponse {
  warehouseId?: string | null
  id?: string | null
  name?: string | null
  code?: string | null
  facilityCode?: string | null
  streetAddress?: string | null
  streetAddress2?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  stateOrProvince?: string | null
  postalCode?: string | null
  zipCode?: string | null
  country?: string | null
  countryCode?: string | null
  phone?: string | null
  email?: string | null
  isActive?: boolean | null
  active?: boolean | null
  timezone?: string | null
  cutoffTime?: string | null
  dailyCutoffTime?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: JdaWarehouseResponse): Warehouse {
  const street1 = raw.streetAddress ?? raw.address ?? undefined
  const street2 = raw.streetAddress2 ?? raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const state = raw.stateOrProvince ?? raw.state ?? undefined
  const postalCode = raw.postalCode ?? raw.zipCode ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const phone = raw.phone ?? undefined
  const email = raw.email ?? undefined

  const hasAddress = street1 || city || state || postalCode || country

  return {
    id: raw.warehouseId ?? raw.id ?? undefined,
    name: raw.name ?? undefined,
    code: raw.facilityCode ?? raw.code ?? undefined,
    address: hasAddress
      ? {
          street1,
          street2,
          city,
          state,
          postalCode,
          country,
          phone,
          email,
        }
      : undefined,
    isActive: raw.isActive ?? raw.active ?? true,
    timezone: raw.timezone ?? undefined,
    cutoffTime: raw.cutoffTime ?? raw.dailyCutoffTime ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
