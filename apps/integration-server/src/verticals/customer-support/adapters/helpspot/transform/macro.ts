/**
 * HelpSpot saved response -> canonical Macro transform.
 *
 * HelpSpot calls these "Saved Replies" (accessed via private.response.listAll
 * and private.response.get). They are pre-written responses staff can insert.
 *
 * Fields:
 *   xResponse       — numeric saved-reply ID
 *   sResponseTitle  — title / name of the saved reply
 *   tResponse       — body content (HTML or plain text)
 *   xCategory       — associated category (used as category label)
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpspotResponse {
  xResponse?: number | string
  sResponseTitle?: string
  tResponse?: string
  xCategory?: number | string
  [key: string]: unknown
}

export function transformMacro(raw: RawHelpspotResponse): Macro {
  const id = String(raw.xResponse ?? '')

  return {
    id,
    externalId: id,
    title: pickStr(raw.sResponseTitle) ?? '',
    body: pickStr(raw.tResponse) ?? '',
    category: raw.xCategory ? String(raw.xCategory) : undefined,
    platform: 'helpspot',
    metadata: strMap({}),
    raw,
  }
}
