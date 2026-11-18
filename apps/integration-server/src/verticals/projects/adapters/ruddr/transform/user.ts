/**
 * Transform a raw Ruddr member object into the canonical User schema.
 *
 * Ruddr calls team members "members". Each member has an id, name, email,
 * and various settings; we map to the minimal canonical User fields.
 *
 * Docs: https://docs.ruddr.io/api-reference/members/list-members
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawRuddrMember {
  id: string
  name?: string
  email?: string
  isActive?: boolean
  isBillable?: boolean
  employmentTypeId?: string
  jobTitle?: { id: string; name?: string } | null
  practice?: { id: string; name?: string } | null
  location?: { id: string; name?: string } | null
  manager?: { id: string; name?: string } | null
  securityRole?: { id: string; name?: string }
  createdAt?: string
  [key: string]: unknown
}

export function transformUser(raw: RawRuddrMember, workspaceId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'ruddr',
    metadata: strMap({
      isActive: raw.isActive,
      isBillable: raw.isBillable,
      employmentTypeId: raw.employmentTypeId,
      jobTitle: raw.jobTitle?.name,
      practiceName: raw.practice?.name,
      locationName: raw.location?.name,
      securityRole: raw.securityRole?.name,
    }),
    raw,
  }
}
