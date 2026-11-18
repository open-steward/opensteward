import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * A canonical User maps to an AdaptiveWork **User** entity. `id` is the
 * `/User/<uuid>` URI. The display name is composed from `FirstName` +
 * `LastName`, falling back to `UserName`. `workspaceIds` carries the owning
 * organization id when known (AdaptiveWork users belong to a single org).
 */
export interface RawClarizenUser {
  id: string
  FirstName?: string
  LastName?: string
  Email?: string
  UserName?: string
  State?: string | { id?: string; Name?: string }
  CreatedOn?: string
  LastUpdatedOn?: string
  [key: string]: unknown
}

function fullName(raw: RawClarizenUser): string {
  const parts = [pickStr(raw.FirstName), pickStr(raw.LastName)].filter(
    (p): p is string => !!p,
  )
  if (parts.length > 0) return parts.join(' ')
  return pickStr(raw.UserName) ?? pickStr(raw.Email) ?? ''
}

function stateText(state: RawClarizenUser['State']): string | undefined {
  if (typeof state === 'string') return state
  return pickStr(state?.Name ?? state?.id)
}

export function transformUser(raw: RawClarizenUser, workspaceId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.Email),
    name: fullName(raw),
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'planview-adaptivework',
    metadata: strMap({
      userName: pickStr(raw.UserName),
      state: stateText(raw.State),
      createdOn: toIso(raw.CreatedOn),
    }),
    raw,
  }
}
