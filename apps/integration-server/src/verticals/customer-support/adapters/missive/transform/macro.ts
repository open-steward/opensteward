/**
 * Missive saved response → Macro
 *
 * Missive saved responses (canned replies) are fetched from GET /v1/responses.
 * Each response has an id, name, and body (the template text).
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMissiveResponse {
  id: string
  name?: string | null
  body?: string | null
  subject?: string | null
  [key: string]: unknown
}

export function transformMacro(raw: RawMissiveResponse): Macro {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    title: pickStr(raw.name) ?? '',
    body: pickStr(raw.body) ?? '',
    category: undefined,
    platform: 'missive',
    metadata: strMap({
      subject: raw.subject,
    }),
    raw,
  }
}
