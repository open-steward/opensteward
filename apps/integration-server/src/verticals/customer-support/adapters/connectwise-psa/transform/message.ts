/**
 * ConnectWise PSA ticket note transform.
 *
 * Source endpoint: GET /service/tickets/{ticketId}/notes, GET /service/tickets/{ticketId}/notes/{id}
 *
 * Key fields:
 *   id, text, internalFlag (internal=true → private note), externalFlag (customer-visible),
 *   member (author if agent), contact (author if end-user), createdBy (fallback name),
 *   _info.dateEntered (creation timestamp)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawCwNote {
  id: number
  text?: string
  /** true = internal/private note not visible to customer */
  internalFlag?: boolean
  /** true = note is visible to the customer portal */
  externalFlag?: boolean
  /** Member (agent) who created the note */
  member?: { id?: number; identifier?: string; name?: string } | null
  /** Contact (end-user) associated with the note */
  contact?: { id?: number; name?: string } | null
  /** Plain-text login name of the creator */
  createdBy?: string
  resolutionFlag?: boolean
  customerUpdatedFlag?: boolean
  _info?: {
    dateEntered?: string
    lastUpdated?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformMessage(raw: RawCwNote, ticketId: string): Message {
  // internalFlag=true → private/internal note; otherwise public
  const type: MessageType = raw.internalFlag === true ? 'internal' : 'public'

  // Determine author: member (agent) takes precedence over contact (end-user)
  let authorId: string
  let authorType: AuthorType
  if (raw.member?.id != null) {
    authorId = String(raw.member.id)
    authorType = 'user'
  } else if (raw.contact?.id != null) {
    authorId = String(raw.contact.id)
    authorType = 'contact'
  } else {
    authorId = pickStr(raw.createdBy) ?? ''
    authorType = 'system'
  }

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.text) ?? '',
    type,
    createdAt: toIso(raw._info?.dateEntered) ?? new Date(0).toISOString(),
    platform: 'connectwise-psa',
    metadata: strMap({
      resolutionFlag: raw.resolutionFlag,
      customerUpdatedFlag: raw.customerUpdatedFlag,
      externalFlag: raw.externalFlag,
      createdBy: raw.createdBy,
    }),
    raw,
  }
}
