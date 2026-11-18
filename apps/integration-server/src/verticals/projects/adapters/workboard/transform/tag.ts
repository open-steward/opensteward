import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * WorkBoard Tag — labels attached to metrics/goals.
 *
 * Representative fields from WorkBoard REST API v1:
 *   GET /wb/apis/tags/{tag_id}  →  single tag object
 *   PUT /wb/apis/metric/{metric_id}/tags  →  tags array on a metric
 */
export interface RawWorkboardTag {
  tag_id?: string | number
  id?: string | number
  name?: string
  color?: string
  [key: string]: unknown
}

export function transformTag(raw: RawWorkboardTag): Tag {
  const id = String(raw.tag_id ?? raw.id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'workboard',
    metadata: strMap({}),
    raw,
  }
}
