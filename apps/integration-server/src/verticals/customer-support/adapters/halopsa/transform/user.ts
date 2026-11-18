/**
 * Transform a raw HaloPSA Agent (support technician) to the canonical User shape.
 *
 * HaloPSA wire fields for Agent objects:
 *   id            — integer agent ID
 *   name          — full display name
 *   firstname     — given name
 *   surname       — family name
 *   email         — primary email address
 *   team_id       — primary team assignment
 *   role          — { id, name } role object
 *   isactive      — boolean (false = deactivated)
 *   username      — login username
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHaloPsaAgent {
  id: number
  name?: string | null
  firstname?: string | null
  surname?: string | null
  email?: string | null
  team_id?: number | null
  role?: { id?: number; name?: string } | string | null
  isactive?: boolean | null
  username?: string | null
  [key: string]: unknown
}

function resolveName(raw: RawHaloPsaAgent): string {
  if (pickStr(raw.name)) return String(raw.name)
  const first = pickStr(raw.firstname) ?? ''
  const last = pickStr(raw.surname) ?? ''
  return `${first} ${last}`.trim()
}

function resolveRole(raw: RawHaloPsaAgent): string | undefined {
  if (typeof raw.role === 'string') return pickStr(raw.role)
  if (raw.role && typeof raw.role === 'object') return pickStr((raw.role as { name?: string }).name)
  return undefined
}

export function transformUser(raw: RawHaloPsaAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: resolveName(raw),
    role: resolveRole(raw),
    teamIds: raw.team_id != null ? [String(raw.team_id)] : [],
    platform: 'halopsa',
    metadata: strMap({ isactive: raw.isactive, username: raw.username }),
    raw,
  }
}
