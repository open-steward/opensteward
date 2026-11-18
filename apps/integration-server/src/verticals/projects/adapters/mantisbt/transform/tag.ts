/**
 * MantisBT tag → canonical Tag transform.
 *
 * MantisBT supports tags (labels) that can be attached to issues.
 * Tags are returned from GET /issues/{id} in the `tags` array,
 * and as standalone objects with fields: id, name.
 *
 * MantisBT has no workspace concept — workspaceId is a fixed placeholder.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMantisbtTag {
  id?: number
  name?: string
  [key: string]: unknown
}

export function transformTag(raw: RawMantisbtTag): Tag {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: 'default',
    name: pickStr(raw.name) ?? '',
    color: undefined,
    platform: 'mantisbt',
    metadata: strMap({}),
    raw,
  }
}
