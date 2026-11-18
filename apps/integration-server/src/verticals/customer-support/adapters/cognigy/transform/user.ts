/**
 * Transform a Cognigy Live Agent (Chatwoot) agent into the canonical
 * User schema.
 *
 * Wire shape: agent object from
 *   GET /api/v1/accounts/{account_id}/agents
 *
 * Chatwoot agents have role: 'agent' | 'administrator'.
 * There is no team membership list on the agent object itself.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCognigyAgent {
  id: number
  name?: string
  email?: string
  role?: string
  availability_status?: string
  auto_offline?: boolean
  confirmed?: boolean
  [key: string]: unknown
}

export function transformUser(raw: RawCognigyAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: [],  // Chatwoot agent endpoint does not include team membership
    platform: 'cognigy',
    metadata: strMap({
      availabilityStatus: raw.availability_status,
      confirmed: raw.confirmed,
    }),
    raw,
  }
}
