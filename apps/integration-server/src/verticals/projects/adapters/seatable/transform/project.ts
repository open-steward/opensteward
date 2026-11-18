/**
 * SeaTable base (dtable) → canonical Project.
 *
 * Base objects appear in GET /api/v2.1/user-admin-dtables/ (`personal[]`,
 * `groups[].dtables[]`, https://api.seatable.com/reference/listbases-1) and in
 * GET /api/v2.1/workspaces/?detail=true (`workspace_list[].table_list[]`,
 * https://api.seatable.com/reference/listworkspaces). The documented example
 * base in both:
 *   { "id": 562, "workspace_id": 204,
 *     "uuid": "12345678-fd55-48e4-8c4a-5fd6f2549765", "name": "All types",
 *     "creator": "Michael Jackson", "modifier": "Michael Jackson",
 *     "created_at": "2021-06-21T14:52:11+00:00",
 *     "updated_at": "2021-10-18T08:47:02+00:00",
 *     "color": null, "text_color": null, "icon": null }
 *
 * The canonical id is `uuid`: the base operations (rows, comments,
 * collaborators) address a base by `base_uuid`. `creator` / `modifier` are
 * display names, not user ids, so they go to metadata rather than `ownerId`.
 * A base has no documented status, so status is 'unknown'.
 */
import type { Project } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSeatableProject {
  id?: number
  workspace_id?: number
  uuid?: string
  name?: string
  creator?: string
  modifier?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformProject(raw: RawSeatableProject): Project {
  const id = pickStr(raw.uuid)
  if (!id) throw new Error('SeaTable base is missing its documented `uuid`')
  const workspaceId = pickStr(raw.workspace_id)
  if (!workspaceId)
    throw new Error(`SeaTable base ${id} is missing its documented \`workspace_id\``)
  return {
    id,
    externalId: id,
    workspaceId,
    name: pickStr(raw.name) ?? '',
    status: 'unknown',
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'seatable',
    metadata: strMap({
      intId: raw.id,
      creator: raw.creator,
      modifier: raw.modifier,
    }),
    raw,
  }
}
