import type { Warehouse } from '../../../schema/warehouse'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface Project44StopLocationAddress {
  addressLines?: string[]
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface Project44OpeningHoursEntry {
  openTime?: string
  closeTime?: string
  [key: string]: unknown
}

export interface Project44StopLocation {
  id?: string
  name?: string
  suppliedId?: string
  address?: Project44StopLocationAddress
  version?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface Project44StopLocationsResponse {
  locations?: Project44StopLocation[]
  offset?: number
  pageSize?: number
  totalItems?: number
  [key: string]: unknown
}

function toAddress(raw: Project44StopLocationAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const lines = raw.addressLines ?? []
  const hasAny = lines.length > 0 || raw.city || raw.state || raw.postalCode || raw.country
  if (!hasAny) return undefined
  return {
    street1: lines[0] ?? undefined,
    street2: lines[1] ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.country ?? undefined,
  }
}

export function transformWarehouse(raw: Project44StopLocation): Warehouse {
  return {
    id: raw.id ?? raw.suppliedId ?? 'unknown',
    name: raw.name ?? undefined,
    code: raw.suppliedId ?? undefined,
    address: toAddress(raw.address),
    isActive: true,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
