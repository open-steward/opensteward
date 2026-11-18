/**
 * HelpSpot category -> canonical Team transform.
 *
 * In HelpSpot, "Categories" are the primary organisational unit for routing
 * requests (equivalent to teams/groups in other platforms). They are returned
 * by private.request.getCategories.
 *
 * Fields:
 *   xCategory   — numeric category ID
 *   sCategory   — category display name
 *   fDeleted    — 1=deleted (soft-deleted)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpspotCategory {
  xCategory?: number | string
  sCategory?: string
  fDeleted?: number | string
  [key: string]: unknown
}

export function transformTeam(raw: RawHelpspotCategory): Team {
  const id = String(raw.xCategory ?? '')

  return {
    id,
    externalId: id,
    name: pickStr(raw.sCategory) ?? '',
    platform: 'helpspot',
    metadata: strMap({ fDeleted: raw.fDeleted }),
    raw,
  }
}
