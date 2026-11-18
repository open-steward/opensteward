/**
 * Transforms an Omnidesk staff member to the canonical User (agent) schema.
 *
 * Omnidesk staff fields: staff_id, staff_email, staff_full_name,
 * role_id, active, status_id, created_at, updated_at.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOmnideskStaff {
  staff_id: number
  staff_email?: string
  staff_full_name?: string
  role_id?: number | null
  active?: boolean
  status_id?: number | null
  [key: string]: unknown
}

export function transformUser(raw: RawOmnideskStaff): User {
  return {
    id: String(raw.staff_id),
    externalId: String(raw.staff_id),
    email: pickStr(raw.staff_email),
    name: pickStr(raw.staff_full_name) ?? '',
    role: raw.role_id != null ? String(raw.role_id) : undefined,
    teamIds: [],
    platform: 'omnidesk',
    metadata: strMap({
      roleId: raw.role_id,
      active: raw.active,
      statusId: raw.status_id,
    }),
    raw,
  }
}
