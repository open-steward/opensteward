import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * ProductPlan user object (from /api/v2/users).
 *
 * Filterable attributes: id, name, email, phone_number, status,
 * ref_source, created_at.
 */
export interface RawProductplanUser {
  id?: number | string
  name?: string
  email?: string
  phone_number?: string
  status?: string
  ref_source?: string
  created_at?: string
  [key: string]: unknown
}

export function transformUser(raw: RawProductplanUser): User {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: [],
    platform: 'productplan',
    metadata: strMap({
      status: raw.status,
      refSource: raw.ref_source,
      phoneNumber: raw.phone_number,
    }),
    raw,
  }
}
