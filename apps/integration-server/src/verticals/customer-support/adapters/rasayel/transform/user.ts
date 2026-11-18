/**
 * Transform a Rasayel AppUser into the canonical User (agent) shape.
 *
 * Rasayel AppUser fields (GraphQL):
 *   id (Int!), uuid (String!), email (String!), displayName (String),
 *   fullName (String), userRole (Role), status (AppUserStatusEnum),
 *   createdAt (Int!), updatedAt (Int)
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawRasayelAppUser {
  id: number
  uuid?: string
  email?: string
  displayName?: string
  fullName?: string
  userRole?: { name?: string } | null
  /** Deprecated role field */
  role?: string | null
  status?: string
  [key: string]: unknown
}

export function transformUser(raw: RawRasayelAppUser): User {
  const roleName = pickStr(raw.userRole?.name) ?? pickStr(raw.role)

  return {
    id: String(raw.id),
    externalId: raw.uuid ?? String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.fullName) ?? pickStr(raw.displayName) ?? '',
    role: roleName,
    teamIds: [],
    platform: 'rasayel',
    metadata: strMap({ uuid: raw.uuid, status: raw.status }),
    raw,
  }
}
