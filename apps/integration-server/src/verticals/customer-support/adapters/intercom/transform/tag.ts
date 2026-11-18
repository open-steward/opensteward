/**
 * Intercom tag → canonical Tag. Fields: the `tag` schema of the 2.16 OpenAPI
 * description (`type`, `id`, `name`); Intercom tags carry no colour.
 * https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 */
import type { Tag } from '../../../schema'
import { pickStr } from './shared'

export interface RawIntercomTag {
  type?: string
  id: string | number
  name?: string | null
  [key: string]: unknown
}

export function transformTag(raw: RawIntercomTag): Tag {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'intercom',
    metadata: {},
    raw,
  }
}
