/**
 * Kayako user (role=AGENT/ADMIN) → canonical User transform.
 *
 * Agents have `teams` as an array of team reference objects.
 * The `role` field is a nested object with a `label` property.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface KayakoRoleRef {
  label?: string
  [key: string]: unknown
}

export interface KayakoTeamRefForUser {
  id?: number
  title?: string
  [key: string]: unknown
}

export interface KayakoEmailIdentityForUser {
  address?: string
  is_primary?: boolean
  [key: string]: unknown
}

export interface RawKayakoAgent {
  id: number
  legacy_id?: string | null
  full_name?: string
  emails?: KayakoEmailIdentityForUser[]
  role?: KayakoRoleRef | string
  teams?: KayakoTeamRefForUser[]
  [key: string]: unknown
}

function primaryEmail(raw: RawKayakoAgent): string | undefined {
  const emails = raw.emails ?? []
  const primary = emails.find((e) => e.is_primary) ?? emails[0]
  return pickStr(primary?.address)
}

function roleLabel(raw: RawKayakoAgent): string | undefined {
  if (!raw.role) return undefined
  if (typeof raw.role === 'string') return raw.role
  return pickStr(raw.role.label)
}

export function transformUser(raw: RawKayakoAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.legacy_id ?? raw.id),
    email: primaryEmail(raw),
    name: pickStr(raw.full_name) ?? '',
    role: roleLabel(raw),
    teamIds: (raw.teams ?? [])
      .map((t) => (t.id ? String(t.id) : ''))
      .filter(Boolean),
    platform: 'kayako',
    metadata: strMap({}),
    raw,
  }
}
