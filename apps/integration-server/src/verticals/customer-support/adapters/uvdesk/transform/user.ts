/**
 * UVdesk agent/member (user) transform.
 *
 * UVdesk member wire shape (GET /{locale}/api/members.json):
 *   id, email, name, firstName, lastName, isActive, role, smallThumbnail
 *
 * Single member (GET /{locale}/api/member/{id}.json):
 *   id, email, firstName, lastName, role, isActive, isEnabled, isVerified,
 *   contactNumber, designation, signature
 *
 * Role values: ROLE_ADMIN, ROLE_AGENT (or lower-cased variants)
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUvdeskMember {
  id?: number | string
  email?: string
  name?: string
  firstName?: string
  lastName?: string
  isActive?: boolean
  isEnabled?: boolean
  isVerified?: boolean
  role?: string
  smallThumbnail?: string | null
  contactNumber?: string | null
  designation?: string | null
  signature?: string | null
  [key: string]: unknown
}

function resolveName(raw: RawUvdeskMember): string {
  if (raw.name) return String(raw.name)
  const first = raw.firstName ? String(raw.firstName) : ''
  const last = raw.lastName ? String(raw.lastName) : ''
  return `${first} ${last}`.trim()
}

export function transformUser(raw: RawUvdeskMember): User {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.email),
    name: resolveName(raw),
    role: pickStr(raw.role),
    teamIds: [],
    platform: 'uvdesk',
    metadata: strMap({
      isActive: raw.isActive,
      designation: raw.designation,
    }),
    raw,
  }
}
