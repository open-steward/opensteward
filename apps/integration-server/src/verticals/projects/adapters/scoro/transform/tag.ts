/**
 * Transform a raw Scoro tag into the canonical Tag schema.
 *
 * Scoro tag key fields (API v2, module: "tags"):
 *   id    – integer identifier
 *   name  – tag display name
 *   color – optional hex or named color
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawScoroTag {
  id?: number | string
  name?: string
  color?: string
  [key: string]: unknown
}

export function transformTag(raw: RawScoroTag): Tag {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'scoro',
    metadata: strMap({}),
    raw,
  }
}
