/**
 * ProjectManager task tag → canonical Tag transform.
 *
 * TaskTagDto fields (v4):
 *   id (uuid), name, color
 *
 * Tags in ProjectManager are workspace-level; workspaceId is not returned
 * in the tag object itself (tags are fetched via task query expansion).
 *
 * Docs: https://developer.projectmanager.com/api-reference/task/query-tasks
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawProjectManagerTag {
  id: string
  name?: string | null
  color?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawProjectManagerTag, workspaceId = ''): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId,
    name: pickStr(raw.name ?? undefined) ?? '',
    color: pickStr(raw.color ?? undefined),
    platform: 'projectmanager',
    metadata: strMap({}),
    raw,
  }
}
