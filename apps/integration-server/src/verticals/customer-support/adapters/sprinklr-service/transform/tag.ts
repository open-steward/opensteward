/**
 * Sprinklr Service does not expose a dedicated tags/labels API.
 * Tags here represent UM_STATUSES or similar label resources
 * if available via the bootstrap endpoint. This module is kept
 * minimal — listTags() is not wired up in the adapter.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSprinklrTag {
  id?: string | number
  name?: string
  [key: string]: unknown
}

export function transformTag(raw: RawSprinklrTag): Tag {
  const id = raw.id != null ? String(raw.id) : pickStr(raw.name) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? id,
    platform: 'sprinklr-service',
    metadata: strMap({}),
    raw,
  }
}
