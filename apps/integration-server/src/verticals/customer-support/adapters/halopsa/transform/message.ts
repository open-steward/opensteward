/**
 * Transform a raw HaloPSA Action (ticket update / reply / note) to the
 * canonical Message shape.
 *
 * HaloPSA wire fields for Action objects:
 *   id              — integer action ID
 *   ticket_id       — integer parent ticket ID
 *   who_agentid     — integer ID of the agent who performed the action (0 = end user)
 *   who             — { id, name } of the actor
 *   outcome         — plain-text body of the note/reply
 *   note            — alternative body field (private notes)
 *   actiontype_id   — numeric action type (1=note, 2=customer reply, 3=agent reply, etc.)
 *   isprivate       — boolean (true = internal note)
 *   date            — ISO-8601 timestamp of the action
 *   attachmentcount — integer count of file attachments
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHaloPsaAction {
  id: number
  ticket_id?: number | null
  who_agentid?: number | null
  who?: { id?: number; name?: string } | null
  outcome?: string | null
  note?: string | null
  actiontype_id?: number | null
  isprivate?: boolean | null
  date?: string | null
  attachmentcount?: number | null
  [key: string]: unknown
}

export function transformMessage(raw: RawHaloPsaAction, ticketId: string): Message {
  const type: MessageType = raw.isprivate === true ? 'internal' : 'public'
  // who_agentid > 0 means the actor is a support agent (maps to canonical 'user');
  // 0 / null means end-user/contact (maps to canonical 'contact').
  const authorType: AuthorType = raw.who_agentid != null && raw.who_agentid > 0 ? 'user' : 'contact'
  const body = pickStr(raw.outcome) ?? pickStr(raw.note) ?? ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ticketId,
    authorId: raw.who_agentid != null && raw.who_agentid > 0
      ? String(raw.who_agentid)
      : String(raw.who?.id ?? ''),
    authorType,
    body,
    type,
    attachmentCount: typeof raw.attachmentcount === 'number' ? raw.attachmentcount : undefined,
    createdAt: toIso(raw.date) ?? new Date(0).toISOString(),
    platform: 'halopsa',
    metadata: strMap({ actiontype_id: raw.actiontype_id }),
    raw,
  }
}
