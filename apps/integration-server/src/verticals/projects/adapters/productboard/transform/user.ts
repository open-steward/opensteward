import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Productboard v1 workspace user → canonical User.
 *
 * A token addresses a single workspace with no addressable id, so
 * `workspaceIds` is left empty. Users have name, email, role, and
 * an optional externalId field.
 *
 * v1 endpoint shape:
 *   GET /users → {
 *     data: [{
 *       id, name, email, role, active,
 *       externalId, companyId, createdAt, updatedAt
 *     }]
 *   }
 */
export interface RawProductboardUser {
  id: string
  name?: string
  email?: string
  role?: string
  active?: boolean
  externalId?: string
  companyId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformUser(raw: RawProductboardUser): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: [],
    platform: 'productboard',
    metadata: strMap({
      role: raw.role,
      active: raw.active,
      companyId: raw.companyId,
    }),
    raw,
  }
}
