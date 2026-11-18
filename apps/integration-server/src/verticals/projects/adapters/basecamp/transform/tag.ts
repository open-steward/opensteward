import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawBasecampTag {
  gid: string
  name?: string
  color?: string
  workspace?: { gid: string }
  [key: string]: unknown
}

export function transformTag(raw: RawBasecampTag): Tag {
  return {
    id: raw.gid,
    externalId: raw.gid,
    workspaceId: raw.workspace?.gid ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'basecamp',
    metadata: strMap({}),
    raw,
  }
}
