import type { User } from '../../../schema'
import { pickStr, strMap, type HalLink } from './shared'

/**
 * HAL+JSON User resource. `email` is conditionally present (hidden unless the
 * caller is admin/self or the address is public). OpenProject has no
 * workspace concept, so `workspaceIds` is always empty.
 */
export interface RawOpenProjectUser {
  _type?: string
  id?: number | string
  login?: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string | null
  admin?: boolean
  status?: string
  _links?: {
    self?: HalLink
  }
  [key: string]: unknown
}

export function transformUser(raw: RawOpenProjectUser): User {
  const id = pickStr(raw.id) ?? ''
  const name =
    pickStr(raw.name) ??
    [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ') ??
    ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email ?? undefined),
    name: name || '',
    workspaceIds: [],
    platform: 'openproject',
    metadata: strMap({
      login: raw.login,
      admin: raw.admin,
      status: raw.status,
    }),
    raw,
  }
}
