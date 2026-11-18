import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Meisterplan "resource" → canonical User.
 *
 * Key API fields:
 *   id, firstName, lastName, emailAddress, externalId, primaryRole { id }
 *
 * Resources are not workspace-scoped in the Meisterplan API (they are global
 * to the account).  `workspaceIds` is populated when the caller passes a
 * scenarioId, or left empty otherwise.
 */
export interface RawMeisterplanResource {
  id: string
  firstName?: string | null
  lastName?: string | null
  emailAddress?: string | null
  externalId?: string | null
  primaryRole?: { id?: string } | null
  [key: string]: unknown
}

export function transformUser(raw: RawMeisterplanResource, workspaceId?: string): User {
  const first = pickStr(raw.firstName) ?? ''
  const last = pickStr(raw.lastName) ?? ''
  const fullName = [first, last].filter(Boolean).join(' ')

  return {
    id: raw.id,
    externalId: pickStr(raw.externalId) ?? raw.id,
    email: pickStr(raw.emailAddress),
    name: fullName || raw.id,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'meisterplan',
    metadata: strMap({
      firstName: raw.firstName,
      lastName: raw.lastName,
      primaryRoleId: raw.primaryRole?.id,
    }),
    raw,
  }
}
