import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * PingCode directory user (`GET /v1/directory/users`). `name` is the login
 * handle; `display_name` is the human name shown in the UI — we prefer the
 * latter for the canonical `name`. Users belong to the enterprise (there is
 * no per-workspace membership in the open API).
 */
export interface RawPingcodeUser {
  id: string
  name?: string
  display_name?: string
  email?: string
  is_disabled?: boolean
  avatar?: string
  [key: string]: unknown
}

export function transformUser(raw: RawPingcodeUser): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.display_name) ?? pickStr(raw.name) ?? '',
    workspaceIds: [],
    platform: 'pingcode',
    metadata: strMap({
      loginName: raw.name,
      isDisabled: raw.is_disabled,
    }),
    raw,
  }
}
