/**
 * Transform a raw Nuclino User object into a canonical User.
 *
 * User object fields:
 *   object, id, firstName, lastName, email, avatarUrl
 *
 * The Nuclino API exposes only GET /v0/users/:id (no list endpoint).
 * A teamId context can be supplied externally when the user is fetched
 * in a team scope.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawNuclinoUser {
  object?: string
  id: string
  firstName?: string
  lastName?: string
  email?: string
  avatarUrl?: string
  [key: string]: unknown
}

export function transformUser(raw: RawNuclinoUser, teamId?: string): User {
  const firstName = pickStr(raw.firstName) ?? ''
  const lastName = pickStr(raw.lastName) ?? ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: fullName || raw.id,
    workspaceIds: teamId ? [teamId] : [],
    platform: 'nuclino',
    metadata: strMap({
      avatarUrl: raw.avatarUrl,
      firstName,
      lastName,
    }),
    raw,
  }
}
