import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * ONES user row from GET /account/users/search (`data.list[]`).
 *
 * Documented fields: "id string User id email string Email name string
 * Username phone string Mobile number avatar string User avatar organization
 * string Company name staffID string Staff number position string Position
 * status string Possible values: [ normal , disable , pending ] User status".
 * phone, avatar and organization are not mapped into canonical fields or
 * metadata; they remain only in `raw`, like every other adapter's raw row.
 *
 * Docs: https://docs.ones.com/developer/openapi/api/01-get-team-user-search-list/
 */
export interface RawOnesUser {
  id?: string
  email?: string
  name?: string
  phone?: string
  avatar?: string
  organization?: string
  staffID?: string
  position?: string
  status?: string
  [key: string]: unknown
}

export function transformUser(raw: RawOnesUser, workspaceId?: string): User {
  const id = pickStr(raw.id)
  if (!id) throw new Error('ONES user row has no id')
  const name = pickStr(raw.name)
  if (name === undefined) throw new Error(`ONES user ${id} has no name`)
  const workspaceIds = workspaceId ? [workspaceId] : []
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name,
    workspaceIds,
    platform: 'ones',
    metadata: strMap({
      staffId: raw.staffID,
      position: raw.position,
      status: raw.status,
    }),
    raw,
  }
}
