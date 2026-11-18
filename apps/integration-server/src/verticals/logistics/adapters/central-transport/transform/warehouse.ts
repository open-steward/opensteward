/**
 * Central Transport warehouse transforms.
 *
 * Piyovi exposes shipping origin/destination locations via:
 *   GET /v1/locations        — list all locations
 *   GET /v1/locations/{id}   — get single location by id
 *
 * A Piyovi "location" corresponds to a shipper facility (warehouse /
 * fulfillment centre) and maps directly to the canonical Warehouse schema.
 */
import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ─── Raw Piyovi types ────────────────────────────────────────────────────────

export interface PiyoviLocationAddress {
  contactName?: string
  emailAddress?: string
  phoneNumber1?: string
  address1?: string
  address2?: string
  city?: string
  stateProvince?: string
  country?: string
  zipPostalCode?: string
  [key: string]: unknown
}

export interface PiyoviLocation {
  id?: string
  referenceId?: string
  groupId?: string
  locationName?: string
  active?: boolean
  address?: PiyoviLocationAddress
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface PiyoviLocationsResponse {
  data?: PiyoviLocation[]
  items?: PiyoviLocation[]
  locations?: PiyoviLocation[]
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

function toWarehouseAddress(raw: PiyoviLocationAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.contactName ?? undefined,
    street1: raw.address1 ?? undefined,
    street2: raw.address2 ?? undefined,
    city: raw.city ?? undefined,
    state: raw.stateProvince ?? undefined,
    postalCode: raw.zipPostalCode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phoneNumber1 ?? undefined,
    email: raw.emailAddress ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

export function transformWarehouse(raw: PiyoviLocation): Warehouse {
  return {
    id: raw.id ?? raw.referenceId ?? undefined,
    name: raw.locationName ?? undefined,
    code: raw.referenceId ?? raw.groupId ?? undefined,
    address: toWarehouseAddress(raw.address),
    isActive: typeof raw.active === 'boolean' ? raw.active : undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function extractLocations(raw: PiyoviLocationsResponse): PiyoviLocation[] {
  return raw.data ?? raw.items ?? raw.locations ?? []
}
