/**
 * SeaTable workspace → canonical Workspace.
 *
 * GET /api/v2.1/workspaces/ (https://api.seatable.com/reference/listworkspaces)
 * returns `workspace_list`; with detail=false "only the ID, name and type of
 * each workspace is listed". Documented example:
 *   { "id": 1, "name": "personal", "type": "personal" },
 *   { "id": 5, "name": "my group", "type": "group" }
 * The "starred" and "shared" entries carry `"id": ""`: they are views over
 * other workspaces' bases, not workspaces, and the list skips them.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSeatableWorkspace {
  id: number | string
  name?: string
  type?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawSeatableWorkspace): Workspace {
  const id = pickStr(raw.id)
  if (!id) throw new Error('SeaTable workspace has no id (a starred/shared view, not a workspace)')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'seatable',
    metadata: strMap({
      type: raw.type,
    }),
    raw,
  }
}
