import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Nutcache organization — maps to canonical Workspace.
 *
 * Key fields from GET /webapi/organizations:
 *   id, guid, name, email, phone, website, address, city, zip_code,
 *   status (0=Active, 1=Inactive, 2=Expired), active_user_count, logo_url
 */
export interface RawNutcacheOrganization {
  id: number
  guid?: string
  name?: string
  email?: string
  phone?: string
  website?: string
  address?: string
  city?: string
  zip_code?: string
  status?: number
  active_user_count?: number
  logo_url?: string
  is_owner?: boolean
  type?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawNutcacheOrganization): Workspace {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'nutcache',
    metadata: strMap({
      guid: raw.guid,
      email: raw.email,
      phone: raw.phone,
      website: raw.website,
      address: raw.address,
      city: raw.city,
      zipCode: raw.zip_code,
      status: raw.status,
      activeUserCount: raw.active_user_count,
      logoUrl: raw.logo_url,
      isOwner: raw.is_owner,
    }),
    raw,
  }
}
