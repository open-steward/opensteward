import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Microsoft To Do has no organisation/workspace concept above the list
 * level — everything lives in the signed-in user's mailbox. We surface a
 * single synthetic workspace representing that mailbox, populated from the
 * Graph `/me` user object so task lists have a stable parent container.
 */
export interface RawMeUser {
  id: string
  displayName?: string
  userPrincipalName?: string
  mail?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawMeUser): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.displayName) ?? pickStr(raw.userPrincipalName) ?? '',
    platform: 'microsoft-todo',
    metadata: strMap({
      userPrincipalName: raw.userPrincipalName,
      mail: raw.mail,
    }),
    raw,
  }
}
