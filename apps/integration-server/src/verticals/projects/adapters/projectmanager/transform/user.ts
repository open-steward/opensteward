/**
 * ProjectManager resource → canonical User transform.
 *
 * ResourceDto fields (v4):
 *   id (uuid), name, firstName, lastName,
 *   email, phone, isActive,
 *   role, avatarUrl, language,
 *   city, state, country,
 *   createdDate, modifiedDate,
 *   teams[] (ResourceTeamDto: id, teamId, teamName),
 *   skills[] (ResourceSkillDto: id, name)
 *
 * Docs: https://developer.projectmanager.com/api-reference/resource/query-resources
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface RawPmResourceTeam {
  id?: string
  teamId?: string
  teamName?: string
}

export interface RawProjectManagerUser {
  id: string
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  isActive?: boolean
  role?: string | null
  avatarUrl?: string | null
  language?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  createdDate?: string | null
  modifiedDate?: string | null
  teams?: RawPmResourceTeam[] | null
  [key: string]: unknown
}

export function transformUser(raw: RawProjectManagerUser, workspaceId?: string): User {
  const workspaceIds = workspaceId ? [workspaceId] : []
  // Build display name: prefer name field, else firstName + lastName
  const composed = [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim()
  const displayName = pickStr(raw.name ?? undefined) ?? (composed.length > 0 ? composed : '')

  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email ?? undefined),
    name: displayName,
    workspaceIds,
    platform: 'projectmanager',
    metadata: strMap({
      role: raw.role,
      isActive: raw.isActive,
      phone: raw.phone,
      city: raw.city,
      state: raw.state,
      country: raw.country,
      createdDate: toIso(raw.createdDate),
      modifiedDate: toIso(raw.modifiedDate),
    }),
    raw,
  }
}
