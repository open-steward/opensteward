import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMondayUser {
  gid: string
  name?: string
  email?: string
  workspaces?: Array<{ gid: string }>
  [key: string]: unknown
}

export function transformUser(raw: RawMondayUser, workspaceId?: string): User {
  const workspaceIds = workspaceId
    ? [workspaceId]
    : (raw.workspaces ?? []).map((w) => w.gid)
  return {
    id: raw.gid,
    externalId: raw.gid,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds,
    platform: 'monday',
    metadata: strMap({}),
    raw,
  }
}
