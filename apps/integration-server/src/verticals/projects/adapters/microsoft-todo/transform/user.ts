import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'
import type { RawMeUser } from './workspace'

/**
 * Transform the Graph `/me` user object into the canonical User record.
 *
 * Microsoft To Do exposes only the signed-in mailbox owner under the
 * `Tasks.Read` + `User.Read` scopes — there is no member directory. A single
 * User is synthesised from `/me`, parented to the same synthetic workspace id
 * that `transformWorkspace` produces (the Graph `/me` id).
 */
export function transformUser(raw: RawMeUser): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.mail) ?? pickStr(raw.userPrincipalName),
    name: pickStr(raw.displayName) ?? pickStr(raw.userPrincipalName) ?? '',
    workspaceIds: [raw.id],
    platform: 'microsoft-todo',
    metadata: strMap({
      userPrincipalName: raw.userPrincipalName,
      mail: raw.mail,
    }),
    raw,
  }
}

export type { RawMeUser }
