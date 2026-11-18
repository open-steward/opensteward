/**
 * Tiledesk tag transform.
 *
 * GET /v3/:project_id/tags
 * Response fields: _id, tag (name), color, createdAt, updatedAt.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTiledeskTag {
  _id?: string
  tag?: string
  color?: string | null
  createdAt?: string
  updatedAt?: string
  id_project?: string
  [key: string]: unknown
}

export function transformTag(raw: RawTiledeskTag): Tag {
  const id = pickStr(raw._id) ?? pickStr(raw.tag) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.tag) ?? id,
    color: pickStr(raw.color),
    platform: 'tiledesk',
    metadata: strMap({
      createdAt: toIso(raw.createdAt),
    }),
    raw,
  }
}
