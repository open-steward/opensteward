import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Redmine user object returned by GET /users.json and GET /users/:id.json.
 *
 * Relevant fields:
 *   id           - numeric user id
 *   login        - username
 *   firstname
 *   lastname
 *   mail         - email address
 *   created_on   - ISO-8601
 *   last_login_on - ISO-8601
 *   status       - 1 = active, 0 = anonymous, 2 = registered, 3 = locked
 *   avatar_url
 */
export interface RawRedmineUser {
  id: number
  login?: string
  firstname?: string
  lastname?: string
  mail?: string
  created_on?: string
  last_login_on?: string
  status?: number
  avatar_url?: string
  [key: string]: unknown
}

export function transformUser(raw: RawRedmineUser): User {
  const id = String(raw.id ?? '')
  const firstName = pickStr(raw.firstname) ?? ''
  const lastName = pickStr(raw.lastname) ?? ''
  const fullName = ([firstName, lastName].filter(Boolean).join(' ') || pickStr(raw.login)) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.mail),
    name: fullName,
    workspaceIds: [],
    platform: 'redmine',
    metadata: strMap({
      login: raw.login,
      status: raw.status,
      lastLoginOn: toIso(raw.last_login_on),
      avatarUrl: raw.avatar_url,
    }),
    raw,
  }
}
