import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

// ── Built Accounting raw type ─────────────────────────────────────────────────
// Returned inside `current_business` from GET /api/v3/countries (business info endpoint)

export interface BuiltAfricaBusiness {
  id?: number
  owner_id?: number
  name?: string
  email?: string
  phone_number?: string
  address?: string
  location?: string
  country_id?: number
  industry_id?: number
  currency_id?: number
  logo?: string
  active?: boolean
  created_at?: string
  updated_at?: string
  currency?: {
    id?: number
    short_code?: string
    [key: string]: unknown
  }
  country?: {
    id?: number
    name?: string
    iso_code?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: BuiltAfricaBusiness): Organization {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    currency: raw.currency?.short_code || undefined,
    address: toAddress({
      address1: raw.address || raw.location,
      country: raw.country?.iso_code,
    }),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
