/**
 * Intercom admin (a teammate) → canonical User. Fields: the `admin` schema of
 * the 2.16 OpenAPI description (`GET /admins`, `GET /admins/{admin_id}`).
 * https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 */
import type { User } from '../../../schema'
import { pickEmail, pickStr, strMap } from './shared'

export interface RawIntercomAdmin {
  type?: string
  id: string | number
  name?: string | null
  email?: string | null
  job_title?: string | null
  away_mode_enabled?: boolean
  has_inbox_seat?: boolean
  team_ids?: Array<number | string> | null
  /** "The role assigned to this admin. Only present if the admin has a role assigned." */
  role?: { type?: string; id?: string; name?: string } | null
  [key: string]: unknown
}

export function transformUser(raw: RawIntercomAdmin): User {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    email: pickEmail(raw.email),
    name: pickStr(raw.name) ?? pickStr(raw.email) ?? '',
    role: pickStr(raw.role?.name),
    teamIds: (raw.team_ids ?? []).map((t) => String(t)),
    platform: 'intercom',
    metadata: strMap({
      jobTitle: raw.job_title,
      hasInboxSeat: raw.has_inbox_seat,
      awayModeEnabled: raw.away_mode_enabled,
    }),
    raw,
  }
}
