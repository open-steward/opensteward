/**
 * Transform a Cognigy Live Agent (Chatwoot) team into the canonical
 * Team schema.
 *
 * Wire shape: team object from
 *   GET /api/v1/accounts/{account_id}/teams
 *   GET /api/v1/accounts/{account_id}/teams/{id}
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCognigyTeam {
  id: number
  name?: string
  description?: string | null
  allow_auto_assign?: boolean
  account_id?: number
  is_member?: boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawCognigyTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'cognigy',
    metadata: strMap({
      description: raw.description,
      allowAutoAssign: raw.allow_auto_assign,
    }),
    raw,
  }
}
