/**
 * WATI message transform.
 *
 * Maps one `message_list` item of GET /api/ext/v3/conversations/{target}/messages
 * (https://docs.wati.io/reference/conversations_getmessagesbyconversationid.md)
 * to the canonical Message. The item schema (ConversationEventDto) documents
 * `id`, `created` ("The creation timestamp of the event."), `conversation_id`,
 * `ticket_id` and `event_type`; the documented example adds `text`, `type`,
 * `timestamp`, `owner`, `status`, `avatar_url`, `assigned_id`,
 * `operator_name`, `bot_type` and `local_message_id`.
 *
 * `owner` "Indicates if the message was sent by the business (true) or
 * customer (false)" (https://docs.wati.io/reference/session-message-sent.md).
 * `assigned_id` is the "Unique identifier of the operator assigned to handle
 * this conversation" (https://docs.wati.io/reference/message-received.md): the
 * conversation's assignee, not the sender. No documented field names the
 * sender, so `authorId` is empty rather than guessed. No documented field
 * marks a message as a public reply or an internal note, so `type` is
 * 'unknown'.
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** One item of the documented `message_list`. */
export interface RawWatiMessage {
  id?: string | null
  text?: string | null
  type?: string | null
  timestamp?: string | null
  created?: string | null
  status?: string | null
  /** true = sent by the business; false = sent by the customer */
  owner?: boolean | null
  avatar_url?: string | null
  assigned_id?: string | null
  operator_name?: string | null
  bot_type?: string | null
  local_message_id?: string | null
  conversation_id?: string | null
  ticket_id?: string | null
  /** "The type of event (e.g., message, ticket, broadcast)." */
  event_type?: string | null
}

function mapAuthorType(owner: boolean | null | undefined): AuthorType {
  if (owner === true) return 'user'
  if (owner === false) return 'contact'
  return 'unknown'
}

/**
 * @param conversation the `{target}` the caller listed: the ticket the router
 *   scoped this message list by.
 */
export function transformMessage(raw: RawWatiMessage, conversation: string): Message {
  const id = pickStr(raw.id)
  if (!id) throw new Error('WATI message has no id')
  const createdAt = toIso(raw.created)
  if (!createdAt) throw new Error(`WATI message ${id} has no created timestamp`)
  return {
    id,
    externalId: id,
    ticketId: conversation,
    authorId: '',
    authorType: mapAuthorType(raw.owner),
    body: raw.text ?? '',
    // No documented field says whether a message is customer-visible or an
    // internal note, so the visibility is not asserted.
    type: 'unknown',
    createdAt,
    platform: 'wati',
    metadata: strMap({
      messageType: raw.type,
      status: raw.status,
      assignedId: raw.assigned_id,
      operatorName: raw.operator_name,
      botType: raw.bot_type,
      localMessageId: raw.local_message_id,
      conversationId: raw.conversation_id,
      watiTicketId: raw.ticket_id,
      eventType: raw.event_type,
    }),
    raw,
  }
}
