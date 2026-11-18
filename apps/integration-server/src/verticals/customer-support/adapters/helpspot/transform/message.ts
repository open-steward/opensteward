/**
 * HelpSpot request history item -> canonical Message transform.
 *
 * History items live inside the `request_history` array returned by
 * private.request.get. Relevant fields:
 *   xRequest        — parent request ID (provided by caller)
 *   xPerson         — staff author ID (0 or absent = customer/system)
 *   fPublic         — 1=public/emailed, 0=private/internal
 *   tNote           — note body (plain text)
 *   dtGMTChange     — Unix timestamp of when the change was recorded
 *   attachment_ct   — count of attached files
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso, pickNum } from './shared'

export interface RawHelpspotHistoryItem {
  xPerson?: number | string
  fPublic?: number | string
  tNote?: string
  dtGMTChange?: number | string
  attachment_ct?: number | string
  // Optional ID — not always present in history items; we synthesize from index
  xRequest?: number | string
  [key: string]: unknown
}

export function transformMessage(
  raw: RawHelpspotHistoryItem,
  ticketId: string,
  index: number,
): Message {
  const fPublic = pickNum(raw.fPublic)
  const type: MessageType = fPublic === 1 ? 'public' : 'internal'

  const xPerson = pickNum(raw.xPerson)
  const authorType: AuthorType = xPerson && xPerson > 0 ? 'user' : 'contact'

  // HelpSpot history items have no stable item ID; synthesize from ticket + index
  const id = `${ticketId}:${index}`

  return {
    id,
    externalId: id,
    ticketId,
    authorId: xPerson ? String(xPerson) : '',
    authorType,
    body: pickStr(raw.tNote) ?? '',
    type,
    attachmentCount: pickNum(raw.attachment_ct),
    createdAt: toIso(raw.dtGMTChange) ?? new Date(0).toISOString(),
    platform: 'helpspot',
    metadata: strMap({ fPublic: raw.fPublic }),
    raw,
  }
}
