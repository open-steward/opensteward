/**
 * Transform an HD Team (Frappe Helpdesk) into the canonical Team schema.
 *
 * Key HD Team fields:
 *   name       — document ID (auto-named, same as team_name)
 *   team_name  — display name
 *   disabled   — boolean
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFrappeTeam {
  name: string
  team_name?: string
  disabled?: number | boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawFrappeTeam): Team {
  return {
    id: raw.name,
    externalId: raw.name,
    name: pickStr(raw.team_name) ?? raw.name,
    platform: 'frappe-helpdesk',
    metadata: strMap({ disabled: raw.disabled }),
    raw,
  }
}
