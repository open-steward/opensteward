import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Buildertrend user — an internal user, subcontractor, or customer/owner on a
 * builder account. Maps to the canonical (PII-minimal) User.
 */
export interface RawBuildertrendUser {
  id: number | string
  firstName?: string
  lastName?: string
  name?: string
  displayName?: string
  email?: string
  emailAddress?: string
  builderId?: number | string
  userType?: string
  [key: string]: unknown
}

function fullName(raw: RawBuildertrendUser): string {
  const explicit = pickStr(raw.displayName ?? raw.name)
  if (explicit) return explicit
  const joined = [raw.firstName, raw.lastName]
    .map((p) => pickStr(p))
    .filter((p): p is string => !!p)
    .join(' ')
  return joined
}

export function transformUser(raw: RawBuildertrendUser, workspaceId?: string): User {
  const wsId = workspaceId ?? (raw.builderId != null ? String(raw.builderId) : undefined)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email ?? raw.emailAddress),
    name: fullName(raw),
    workspaceIds: wsId ? [wsId] : [],
    platform: 'buildertrend',
    metadata: strMap({
      userType: raw.userType,
    }),
    raw,
  }
}
