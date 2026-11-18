/**
 * Transforms a raw Zoho Sprints team object into the canonical Workspace schema.
 *
 * In Zoho Sprints the top-level entity is a "team" (organisation workspace).
 * Response fields from GET /zsapi/teams/:
 *   teamId, name, zsoid (org id), domain, createdTime, memberCount
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoSprintsTeam {
  teamId: string
  name?: string
  zsoid?: string
  domain?: string
  createdTime?: string | number
  memberCount?: number | string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawZohoSprintsTeam): Workspace {
  return {
    id: raw.teamId,
    externalId: raw.teamId,
    name: pickStr(raw.name) ?? '',
    platform: 'zoho-sprints',
    metadata: strMap({
      zsoid: raw.zsoid,
      domain: raw.domain,
      memberCount: raw.memberCount,
      createdTime: toIso(raw.createdTime),
    }),
    raw,
  }
}
