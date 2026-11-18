/**
 * Comm100 ticketing tags → canonical Tags.
 *
 * https://developer.comm100.com/docs/server-api-ticketing-tag, Tag JSON
 * Format: "id guid Id of the tag." / "name string Name of the tag."
 */
import type { Tag } from '../../../schema'
import { pickStr, required } from './shared'

export interface RawComm100Tag {
  id?: string
  name?: string
  [key: string]: unknown
}

export function transformTag(raw: RawComm100Tag): Tag {
  const id = required(pickStr(raw.id), 'tag id')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'comm100',
    metadata: {},
    raw,
  }
}
