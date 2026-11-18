import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Favro user. Listed within an organization, so the canonical `workspaceIds`
 * is the single organization id supplied by the caller. Carries `userId`,
 * `name`, `email`, and `organizationRole`
 * (administrator/fullMember/externalMember/guest/disabled).
 */
export interface RawFavroUser {
  userId: string
  name?: string
  email?: string
  organizationRole?: string
  [key: string]: unknown
}

export function transformUser(raw: RawFavroUser, workspaceId?: string): User {
  return {
    id: raw.userId,
    externalId: raw.userId,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'favro',
    metadata: strMap({
      organizationRole: raw.organizationRole,
    }),
    raw,
  }
}
