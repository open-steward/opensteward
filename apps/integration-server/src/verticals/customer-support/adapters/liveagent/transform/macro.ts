/**
 * LiveAgent CannedMessage → canonical Macro.
 *
 * CannedMessage model fields: id, userid, departmentid, messagetext, keywords.
 * LiveAgent calls these "Canned Messages" — they map to the Macro concept.
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLiveagentCannedMessage {
  id?: string
  userid?: string
  departmentid?: string
  messagetext?: string
  keywords?: string
  [key: string]: unknown
}

export function transformMacro(raw: RawLiveagentCannedMessage): Macro {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    title: pickStr(raw.keywords) ?? id,
    body: pickStr(raw.messagetext) ?? '',
    category: undefined, // LiveAgent canned messages do not have categories
    platform: 'liveagent',
    metadata: strMap({
      userId: raw.userid,
      departmentId: raw.departmentid,
    }),
    raw,
  }
}
