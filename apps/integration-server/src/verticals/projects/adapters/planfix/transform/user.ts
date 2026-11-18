import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Planfix employee (`UserResponse`). The display name is assembled from the
 * `name` / `midname` / `lastname` parts. Planfix is single-account, so there is
 * no per-user workspace membership on the wire — `workspaceIds` is left empty
 * (the account host is the workspace). PII is kept to name + email per the
 * canonical schema's posture.
 */
export interface RawPlanfixUser {
  id: number
  name?: string
  midname?: string
  lastname?: string
  email?: string
  login?: string
  status?: string
  role?: string
  groups?: Array<{ id?: number; name?: string }>
  [key: string]: unknown
}

function fullName(raw: RawPlanfixUser): string {
  return [raw.name, raw.midname, raw.lastname]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0)
    .join(' ')
}

export function transformUser(raw: RawPlanfixUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName(raw),
    workspaceIds: [],
    platform: 'planfix',
    metadata: strMap({ login: raw.login, status: raw.status, role: raw.role }),
    raw,
  }
}
