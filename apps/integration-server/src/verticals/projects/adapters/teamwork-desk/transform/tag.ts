/**
 * Transform a raw Teamwork Spaces tag object into the canonical Tag.
 *
 * Tags are installation-scoped and returned by:
 *   GET /spaces/api/v1/tags.json
 *
 * Response envelope: { tags: [...] }
 *
 * Tag fields:
 *   id, name, color, pageCount,
 *   createdAt, createdBy, updatedAt, updatedBy,
 *   deletedAt, deletedBy
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSpacesTag {
  id: number | string
  name?: string
  color?: string
  pageCount?: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  createdBy?: { id: number | string; type?: string } | null
  updatedBy?: { id: number | string; type?: string } | null
  deletedBy?: { id: number | string; type?: string } | null
  [key: string]: unknown
}

export function transformTag(raw: RawSpacesTag): Tag {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    // Tags are installation-scoped — no per-workspace container in Spaces.
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'teamwork-desk',
    metadata: strMap({
      pageCount: raw.pageCount,
      createdAt: toIso(raw.createdAt),
      updatedAt: toIso(raw.updatedAt),
    }),
    raw,
  }
}
