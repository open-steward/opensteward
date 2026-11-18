/**
 * LiveHelpNow ticket action/comment → canonical Message transform.
 *
 * Ticket comments come from the `actions` array in GET /api/ticket/{id}
 * (include_comments=true or include_actions=true).
 *
 * Transforms NEVER throw; missing optional fields return undefined.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Shape of an action/comment entry from GET /api/ticket/{id}. */
export interface RawLivehelpnowTicketAction {
  action?: string
  action_date?: string
  action_log?: string
  operator_id?: number | null
  operator_name?: string | null
  private?: boolean
  [key: string]: unknown
}

export function transformMessage(raw: RawLivehelpnowTicketAction, ticketId: string, index: number): Message {
  // LiveHelpNow actions don't carry a stable ID; synthesise one from ticketId + index.
  const syntheticId = `${ticketId}:action:${index}`
  const type: MessageType = raw.private === true ? 'internal' : 'public'
  // If operator_id is set the message is from an agent (user), otherwise treat as contact reply.
  const authorType: AuthorType = raw.operator_id ? 'user' : 'contact'
  const authorId = raw.operator_id ? String(raw.operator_id) : ''

  return {
    id: syntheticId,
    externalId: syntheticId,
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.action_log) ?? pickStr(raw.action) ?? '',
    type,
    createdAt: toIso(raw.action_date) ?? new Date(0).toISOString(),
    platform: 'livehelpnow',
    metadata: strMap({
      action: raw.action,
      operatorName: raw.operator_name,
    }),
    raw,
  }
}
