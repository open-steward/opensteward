import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Paymo user (the object under the `users` response key). Schema-as-firewall
 * keeps only id/name/email on the canonical shape; type/timezone are surfaced
 * as metadata, the rest of the rich profile stays on `raw`.
 */
export interface RawPaymoUser {
  id: number
  name?: string
  email?: string
  type?: string
  active?: boolean
  timezone?: string
  assigned_projects?: number[]
  managed_projects?: number[]
  [key: string]: unknown
}

export function transformUser(raw: RawPaymoUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    // Paymo accounts have no workspace concept — a user belongs to the single
    // company account, so there are no workspace ids to surface.
    workspaceIds: [],
    platform: 'paymo',
    metadata: strMap({
      type: raw.type,
      active: raw.active,
      timezone: raw.timezone,
    }),
    raw,
  }
}
