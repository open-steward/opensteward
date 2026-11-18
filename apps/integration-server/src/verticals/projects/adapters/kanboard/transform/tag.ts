import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw tag object returned by Kanboard's getAllTags / getTagsByProject / getTaskTags.
 *
 * Docs: https://docs.kanboard.org/v1/api/tags_procedures/
 */
export interface RawKanboardTag {
  id: string | number
  name?: string
  project_id?: string | number
  color_id?: string
  [key: string]: unknown
}

export function transformTag(raw: RawKanboardTag): Tag {
  const id = String(raw.id)
  const workspaceId = raw.project_id ? String(raw.project_id) : ''

  return {
    id,
    externalId: id,
    workspaceId,
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color_id),
    platform: 'kanboard',
    metadata: strMap({ projectId: raw.project_id }),
    raw,
  }
}
