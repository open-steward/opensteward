import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Raw Workfront `user` (objCode `USER`) record. */
export interface RawWorkfrontUser {
  ID: string
  name?: string
  emailAddr?: string
  username?: string
  homeGroupID?: string
  companyID?: string
  [key: string]: unknown
}

export function transformUser(raw: RawWorkfrontUser, workspaceId?: string): User {
  const groupId = workspaceId ?? pickStr(raw.homeGroupID)
  return {
    id: raw.ID,
    externalId: raw.ID,
    email: pickStr(raw.emailAddr),
    name: pickStr(raw.name) ?? '',
    workspaceIds: groupId ? [groupId] : [],
    platform: 'workfront',
    metadata: strMap({ username: raw.username }),
    raw,
  }
}
