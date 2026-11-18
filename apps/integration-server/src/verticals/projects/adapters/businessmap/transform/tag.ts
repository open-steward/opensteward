/**
 * Businessmap tag → canonical Tag transform.
 *
 * API v2 GET /tags  →  { data: [ { tag_id, label, color } ] }
 * Tags are account-scoped, not per-workspace.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawBusinessmapTag {
  tag_id?: number
  label?: string
  color?: string
  [key: string]: unknown
}

export function transformTag(raw: RawBusinessmapTag, workspaceId?: string): Tag {
  const id = String(raw.tag_id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: workspaceId ?? '',
    name: pickStr(raw.label) ?? '',
    color: pickStr(raw.color),
    platform: 'businessmap',
    metadata: strMap({}),
    raw,
  }
}
