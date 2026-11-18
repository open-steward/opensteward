import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Projectplace tag. Returned by `GET /1/tags/projects/{project_id}` which
 * lists all tags in a project with usage counts. Tags are project-scoped;
 * the project id is threaded through from the caller as workspaceId.
 * `color` is a numeric value in the platform; it is serialised as a string
 * here since the canonical Tag.color field is string | undefined.
 */
export interface RawProjectplaceTag {
  id: number | string
  name?: string
  color?: number | string
  count?: number
  [key: string]: unknown
}

export function transformTag(raw: RawProjectplaceTag, workspaceId?: string): Tag {
  const colorRaw = raw.color != null ? String(raw.color) : undefined
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: workspaceId ?? '',
    name: pickStr(raw.name) ?? '',
    color: colorRaw,
    platform: 'projectplace',
    metadata: strMap({ count: raw.count }),
    raw,
  }
}
