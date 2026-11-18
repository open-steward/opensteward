import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Plane label — project-scoped in Plane, surfaced as a canonical Tag.
 * Docs: https://developers.plane.so/api-reference/label/list-labels
 *
 * The owning project is preserved under metadata.projectId; the canonical
 * `workspaceId` carries the Plane workspace UUID.
 */
export interface RawPlaneLabel {
  id: string
  name?: string
  color?: string
  description?: string
  parent?: string | null
  project?: string
  workspace?: string
  [key: string]: unknown
}

export function transformTag(raw: RawPlaneLabel, workspaceId?: string): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: workspaceId ?? pickStr(raw.workspace) ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'plane',
    metadata: strMap({
      projectId: raw.project,
      parentId: raw.parent,
    }),
    raw,
  }
}
