import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawAirtableTag {
  gid: string
  name?: string
  color?: string
  workspace?: { gid: string }
  [key: string]: unknown
}

export function transformTag(raw: RawAirtableTag): Tag {
  return {
    id: raw.gid,
    externalId: raw.gid,
    workspaceId: raw.workspace?.gid ?? '',
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'zenkit',
    metadata: strMap({}),
    raw,
  }
}
