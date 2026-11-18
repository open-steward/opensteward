/**
 * HubSpot Service Hub owner (agent/user) transform.
 *
 * Owners come from GET /crm/v3/owners
 * Response is a flat object (not nested under `properties`).
 *
 * Key response fields:
 *   id, email, firstName, lastName, userId, type, createdAt, updatedAt, archived,
 *   teams (array of { id, name, primary })
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHubspotOwnerTeam {
  id?: string | number
  name?: string
  primary?: boolean
  [key: string]: unknown
}

export interface RawHubspotOwner {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  userId?: number
  type?: string
  createdAt?: string
  updatedAt?: string
  archived?: boolean
  teams?: RawHubspotOwnerTeam[]
  [key: string]: unknown
}

function buildName(raw: RawHubspotOwner): string {
  const first = pickStr(raw.firstName) ?? ''
  const last = pickStr(raw.lastName) ?? ''
  return [first, last].filter(Boolean).join(' ')
}

export function transformUser(raw: RawHubspotOwner): User {
  const teamIds = (raw.teams ?? [])
    .map((t) => (t.id != null ? String(t.id) : undefined))
    .filter((id): id is string => id !== undefined)

  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: buildName(raw),
    role: pickStr(raw.type),
    teamIds,
    platform: 'hubspot-service-hub',
    metadata: strMap({
      userId: raw.userId,
    }),
    raw,
  }
}
