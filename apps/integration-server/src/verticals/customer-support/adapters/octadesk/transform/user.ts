/**
 * Transform Octadesk agent (user) to canonical User.
 *
 * Octadesk agents are returned by GET /persons?role=agent (or equivalent).
 * Fields: id, name, email, role{id, name}, group{id, name}
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOctadeskAgent {
  /** Agent UUID */
  id?: string
  name?: string
  email?: string
  role?: { id?: string; name?: string; [key: string]: unknown } | string
  group?: { id?: string; name?: string; [key: string]: unknown }
  [key: string]: unknown
}

function extractRole(raw: RawOctadeskAgent['role']): string | undefined {
  if (!raw) return undefined
  if (typeof raw === 'string') return raw || undefined
  return pickStr(raw.name)
}

export function transformUser(raw: RawOctadeskAgent): User {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: extractRole(raw.role),
    teamIds: raw.group?.id ? [String(raw.group.id)] : [],
    platform: 'octadesk',
    metadata: strMap({
      groupName: raw.group?.name,
    }),
    raw,
  }
}
