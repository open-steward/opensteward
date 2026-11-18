/**
 * GanttPRO user transform.
 *
 * GET /users       →  array of RawGanttproUser
 * GET /users/{id}  →  single RawGanttproUser
 *
 * The API exposes firstName + lastName separately; we join them for `name`.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGanttproUser {
  id: number | string
  teamId?: number | string
  email?: string
  firstName?: string
  lastName?: string
  username?: string
  photo?: string
  locale?: string
  [key: string]: unknown
}

export function transformUser(raw: RawGanttproUser): User {
  const firstName = pickStr(raw.firstName) ?? ''
  const lastName = pickStr(raw.lastName) ?? ''
  const name =
    firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(' ')
      : (pickStr(raw.username) ?? '')

  const teamId = raw.teamId != null ? String(raw.teamId) : undefined
  const workspaceIds = teamId ? [teamId] : []

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name,
    workspaceIds,
    platform: 'ganttpro',
    metadata: strMap({
      username: raw.username,
      locale: raw.locale,
      photo: raw.photo,
    }),
    raw,
  }
}
