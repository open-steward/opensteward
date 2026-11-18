/**
 * Transforms a Libredesk agent (user of type "agent") into the canonical User
 * schema.
 *
 * Agents are fetched from GET /api/v1/agents. The response shape is the User
 * model with type === "agent".
 *
 * Ref: internal/user/models/models.go (User / UserCompact)
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLibredeskAgent {
  id: number
  external_user_id?: string | null
  first_name?: string
  last_name?: string
  email?: string | null
  type?: string
  availability_status?: string
  enabled?: boolean
  roles?: string[]
  teams?: Array<{ id: number; name?: string }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformUser(raw: RawLibredeskAgent): User {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name) ?? ''
  const name = lastName ? `${firstName} ${lastName}`.trim() : firstName

  const teamIds = Array.isArray(raw.teams)
    ? raw.teams.map((t) => String(t.id))
    : []

  const role = Array.isArray(raw.roles) && raw.roles.length > 0
    ? raw.roles[0]
    : undefined

  return {
    id: String(raw.id),
    externalId: pickStr(raw.external_user_id) ?? String(raw.id),
    email: pickStr(raw.email ?? undefined),
    name,
    role,
    teamIds,
    platform: 'libredesk',
    metadata: strMap({
      availabilityStatus: raw.availability_status,
      enabled: raw.enabled,
      createdAt: toIso(raw.created_at),
    }),
    raw,
  }
}
