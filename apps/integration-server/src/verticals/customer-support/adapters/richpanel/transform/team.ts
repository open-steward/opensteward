import type { Team } from '../../../schema'
import { strMap } from './shared'

/**
 * A team as documented by GET /v1/teams
 * (https://developer.richpanel.com/reference/list-teams): `updated_at`,
 * `created_at`, `id`, `name`, `organization_id`. No member count is documented.
 */
export interface RawRichpanelTeam {
  id: string
  name: string
  organization_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawRichpanelTeam): Team {
  if (typeof raw.id !== 'string' || raw.id === '') throw new Error('Richpanel team has no id')
  if (typeof raw.name !== 'string') throw new Error(`Richpanel team ${raw.id} has no name`)
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    platform: 'richpanel',
    metadata: strMap({
      organization_id: raw.organization_id,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    }),
    raw,
  }
}
