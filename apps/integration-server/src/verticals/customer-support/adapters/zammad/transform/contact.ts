/**
 * Zammad user-as-contact transform.
 *
 * Contacts are Zammad users with customer-facing roles.
 * Endpoint: GET /api/v1/users  (role filter applied at adapter level)
 *           GET /api/v1/users/{id}
 *
 * Docs: https://docs.zammad.org/en/latest/api/user.html
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZammadUser {
  id: number
  login?: string
  firstname?: string
  lastname?: string
  email?: string
  phone?: string | null
  mobile?: string | null
  fax?: string | null
  organization_id?: number | null
  role_ids?: number[]
  group_ids?: Record<string, unknown> | null
  active?: boolean
  verified?: boolean
  vip?: boolean
  department?: string | null
  created_at?: string
  updated_at?: string
  last_login?: string | null
  [key: string]: unknown
}

function fullName(raw: RawZammadUser): string {
  const first = pickStr(raw.firstname) ?? ''
  const last = pickStr(raw.lastname) ?? ''
  const full = [first, last].filter(Boolean).join(' ')
  return full || (pickStr(raw.login) ?? '')
}

export function transformContact(raw: RawZammadUser): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName(raw),
    phone: (pickStr(raw.phone) ?? pickStr(raw.mobile)),
    organizationId: raw.organization_id ? String(raw.organization_id) : undefined,
    platform: 'zammad',
    metadata: strMap({
      login: raw.login,
      active: raw.active,
      verified: raw.verified,
      department: raw.department,
      createdAt: toIso(raw.created_at),
      updatedAt: toIso(raw.updated_at),
    }),
    raw,
  }
}
