/**
 * Snipe-IT location → Location transform.
 */
import type { Location } from '../../../schema/location'
import {pickStr, strMap, toIso} from './shared'

interface SnipeDate {
  datetime?: string
  formatted?: string
}

interface SnipeRef {
  id?: number
  name?: string
}

export interface RawSnipeItLocation {
  id: number
  name?: string
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  zip?: string | null
  phone?: string | null
  fax?: string | null
  parent?: SnipeRef | null
  manager?: SnipeRef | null
  currency?: string | null
  ldap_ou?: string | null
  assets_count?: number
  rtd_assets_count?: number
  assigned_assets_count?: number
  users_count?: number
  children_count?: number
  created_at?: SnipeDate | string | null
  updated_at?: SnipeDate | string | null
  [key: string]: unknown
}

function extractDate(v: SnipeDate | string | null | undefined): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return toIso(v)
  return toIso(v.datetime ?? v.formatted)
}

export function transformLocation(raw: RawSnipeItLocation): Location {
  const id = String(raw.id)
  const hasAddress = !!(raw.address || raw.city || raw.country)

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? id,
    type: 'warehouse',
    parentLocationId: raw.parent?.id != null ? String(raw.parent.id) : undefined,
    address: hasAddress
      ? {
          line1: pickStr(raw.address),
          line2: pickStr(raw.address2),
          city: pickStr(raw.city),
          region: pickStr(raw.state),
          country: pickStr(raw.country),
          postalCode: pickStr(raw.zip),
        }
      : undefined,
    isActive: true,
    platform: 'snipe-it',
    metadata: strMap({
      phone: raw.phone,
      fax: raw.fax,
      currency: raw.currency,
      ldapOu: raw.ldap_ou,
      assetsCount: raw.assets_count,
      assignedAssetsCount: raw.assigned_assets_count,
      rtdAssetsCount: raw.rtd_assets_count,
      usersCount: raw.users_count,
      childrenCount: raw.children_count,
      managerName: raw.manager?.name,
      createdAt: extractDate(raw.created_at),
      updatedAt: extractDate(raw.updated_at),
    }),
    raw,
  }
}
