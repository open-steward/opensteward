/**
 * Supportbench user (owner/agent) → canonical User transform.
 *
 * Supportbench owner/agent records appear embedded in case responses as
 * owner_id + owner (display name). Agent objects retrieved from
 * user-oriented endpoints carry id, name, email, role fields.
 *
 * Note: Supportbench does not expose a dedicated list-agents REST endpoint
 * in the documented public API; users are surfaced via embedded owner fields
 * on cases. The User schema is populated from those fields.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSupportbenchUser {
  id?: string | number | null
  name?: string | null
  email?: string | null
  role?: string | null
  division_id?: string | number | null
  division?: string | null
  active?: boolean | string | null
  [key: string]: unknown
}

export function transformUser(raw: RawSupportbenchUser): User {
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: raw.division_id ? [String(raw.division_id)] : [],
    platform: 'supportbench',
    metadata: strMap({
      division: raw.division,
      active: raw.active,
    }),
    raw,
  }
}
