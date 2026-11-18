/**
 * Transform a Genesys Cloud wrap-up code to the canonical Tag schema.
 *
 * In Genesys Cloud, "wrap-up codes" serve as the closest equivalent to
 * tags/labels — agents apply them at the end of a conversation to categorize
 * the interaction outcome.
 *
 *   GET /api/v2/routing/wrapupcodes  — list all wrap-up codes
 *   GET /api/v2/routing/wrapupcodes/{codeId}  — single code
 *
 * Fields: id, name, dateCreated, dateModified, selfUri.
 *
 * Docs: https://developer.genesys.cloud/routing/routing/
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawGenesysWrapupCode {
  id?: string
  name?: string
  dateCreated?: string
  dateModified?: string
  [key: string]: unknown
}

export function transformTag(raw: RawGenesysWrapupCode): Tag {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'genesys-cloud',
    metadata: strMap({
      dateCreated: toIso(raw.dateCreated),
      dateModified: toIso(raw.dateModified),
    }),
    raw,
  }
}
