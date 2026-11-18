/**
 * Aha! User → canonical User.
 *
 * Aha! exposes a combined `name` plus split `first_name` / `last_name`. The
 * canonical `name` prefers the combined value and falls back to joining the
 * parts. Users are account-scoped, not workspace-scoped, so `workspaceIds`
 * is left empty unless a caller supplies a scope.
 *
 * Never throws — missing optionals resolve to `undefined`.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawAhaUser {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  email?: string
  enabled?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function resolveName(raw: RawAhaUser): string {
  const combined = pickStr(raw.name)
  if (combined) return combined
  const parts = [raw.first_name, raw.last_name].filter((p): p is string => !!p && p.length > 0)
  return parts.join(' ')
}

export function transformUser(raw: RawAhaUser, workspaceId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: resolveName(raw),
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'aha',
    metadata: strMap({
      enabled: raw.enabled,
    }),
    raw,
  }
}
