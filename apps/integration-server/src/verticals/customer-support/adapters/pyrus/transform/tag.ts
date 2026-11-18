/**
 * Pyrus does not have a native tags/labels concept on tasks.
 * This transform file is kept as a placeholder; listTags is not implemented
 * in the PyrusAdapter (returns 501).
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPyrusTag {
  id?: number | string
  name?: string
  [key: string]: unknown
}

export function transformTag(raw: RawPyrusTag): Tag {
  return {
    id: String(raw.id ?? raw.name ?? ''),
    externalId: String(raw.id ?? raw.name ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'pyrus',
    metadata: strMap({}),
    raw,
  }
}
