/**
 * Kayako tag → canonical Tag transform.
 *
 * Kayako tags are returned per-case from GET /api/v1/cases/:id/tags.json.
 * Each tag has an `id` (integer) and a `name` string.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKayakoTag {
  id: number
  name?: string
  [key: string]: unknown
}

export function transformTag(raw: RawKayakoTag): Tag {
  const name = pickStr(raw.name) ?? String(raw.id)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name,
    platform: 'kayako',
    metadata: strMap({}),
    raw,
  }
}
