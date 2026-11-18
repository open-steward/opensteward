/**
 * MantisBT user → canonical User transform.
 *
 * MantisBT users are returned from GET /users/me and GET /users/{id}.
 *
 * Key response fields:
 *   id, name, real_name, email, access_level: {id, name, label},
 *   language, timezone
 *
 * MantisBT has no workspace concept — workspaceIds is always empty.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

interface EnumRef {
  id?: number
  name?: string
  label?: string
  [key: string]: unknown
}

export interface RawMantisbtUser {
  id?: number
  name?: string
  real_name?: string
  email?: string
  access_level?: EnumRef | null
  language?: string
  timezone?: string
  [key: string]: unknown
}

export function transformUser(raw: RawMantisbtUser): User {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.real_name ?? raw.name) ?? '',
    workspaceIds: [],
    platform: 'mantisbt',
    metadata: strMap({
      username: raw.name,
      accessLevel: raw.access_level?.name,
      language: raw.language,
      timezone: raw.timezone,
    }),
    raw,
  }
}
