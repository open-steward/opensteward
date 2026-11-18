/**
 * Factro project tag transform.
 *
 * Project tag fields (camelCase JSON):
 *   id, name, changeDate, mandantId
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawFactroTag {
  id: string
  name?: string
  changeDate?: string
  mandantId?: string
  [key: string]: unknown
}

export function transformTag(raw: RawFactroTag, workspaceId?: string): Tag {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: workspaceId ?? pickStr(raw.mandantId) ?? '',
    name: pickStr(raw.name) ?? '',
    color: undefined,
    platform: 'factro',
    metadata: strMap({ updatedAt: toIso(raw.changeDate) }),
    raw,
  }
}
