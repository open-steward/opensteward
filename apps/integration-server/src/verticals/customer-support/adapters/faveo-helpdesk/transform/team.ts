/**
 * Transform one Faveo Helpdesk v3 team row into the canonical Team schema.
 *
 * Source: GET v3/api/dependency/teams
 * https://developers.faveohelpdesk.com/dependency-list/ — the documented rows
 * carry exactly `{ "id":1, "name":"type-name 1" }`. The team detail pages are
 * password-protected, so nothing else is read.
 */
import type { Team } from '../../../schema'

export interface RawFaveoTeam {
  id: number
  name: string
}

export function transformTeam(raw: RawFaveoTeam): Team {
  if (typeof raw.name !== 'string') {
    throw new Error(`faveo-helpdesk: team ${raw.id} has no name`)
  }
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: raw.name,
    platform: 'faveo-helpdesk',
    metadata: {},
    raw,
  }
}
