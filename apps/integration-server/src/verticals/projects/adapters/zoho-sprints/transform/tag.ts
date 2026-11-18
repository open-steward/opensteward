/**
 * Zoho Sprints does not expose a dedicated tags/labels resource.
 * This file is intentionally minimal — the Tag interface is satisfied
 * but no tag list/get methods are wired in index.ts (they auto-501).
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZohoSprintsTag {
  tagId: string
  name?: string
  color?: string
  teamId?: string
  [key: string]: unknown
}

export function transformTag(raw: RawZohoSprintsTag): Tag {
  return {
    id: raw.tagId,
    externalId: raw.tagId,
    workspaceId: pickStr(raw.teamId) ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'zoho-sprints',
    metadata: strMap({}),
    raw,
  }
}
