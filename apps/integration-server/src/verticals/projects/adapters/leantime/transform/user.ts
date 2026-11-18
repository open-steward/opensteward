/**
 * Transform a Leantime user API object into the canonical User schema.
 *
 * Leantime Users.getAll / getUser fields:
 *   id, username (email), firstname, lastname, email, role, status,
 *   profileId, phone, jobTitle, department, createdAt
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLeantimeUser {
  id?: number | string
  username?: string
  firstname?: string
  lastname?: string
  email?: string
  role?: string
  status?: string
  profileId?: number | string
  phone?: string
  jobTitle?: string
  department?: string
  [key: string]: unknown
}

export function transformUser(raw: RawLeantimeUser): User {
  const id = String(raw.id ?? '')
  const firstName = pickStr(raw.firstname) ?? ''
  const lastName = pickStr(raw.lastname) ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const email = pickStr(raw.email) ?? pickStr(raw.username)
  return {
    id,
    externalId: id,
    email,
    name: fullName || (pickStr(raw.username) ?? ''),
    workspaceIds: [],
    platform: 'leantime',
    metadata: strMap({
      role: raw.role,
      status: raw.status,
      phone: raw.phone,
      jobTitle: raw.jobTitle,
      department: raw.department,
    }),
    raw,
  }
}
