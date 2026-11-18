/**
 * Chaskiq conversation part → canonical Message.
 *
 * A conversation part (ConversationPartType) carries:
 *   id, key, private_note, app_user { id }, message { text_content }, created_at
 * `private_note: true` → internal note; otherwise public.
 *
 * AuthorType mapping:
 *   from_bot=true (trigger_id+step_id present) → 'system'  (automated workflow)
 *   app_user.kind==='agent'                    → 'user'     (support agent)
 *   default (app_user, visitor, lead, null)    → 'contact'  (end-user)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Raw shape returned by the GraphQL `messages` query on a conversation. */
export interface RawChaskiqConversationPart {
  id?: string | null
  key?: string | null
  private_note?: boolean | null
  from_bot?: boolean | null
  app_user?: { id?: string | null; kind?: string | null } | null
  message?: {
    text_content?: string | null
    html_content?: string | null
    [key: string]: unknown
  } | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformMessage(raw: RawChaskiqConversationPart, ticketId: string): Message {
  const type: MessageType = raw.private_note ? 'internal' : 'public'
  let authorType: AuthorType
  if (raw.from_bot) {
    // Automated workflow message (trigger_id + step_id present on the server)
    authorType = 'system'
  } else if (raw.app_user?.kind === 'agent') {
    // Support agent reply
    authorType = 'user'
  } else {
    // End-user (AppUser / Visitor / Lead) or unknown
    authorType = 'contact'
  }

  const id = pickStr(raw.id) ?? pickStr(raw.key) ?? ''
  const body =
    pickStr(raw.message?.text_content) ??
    pickStr(raw.message?.html_content) ??
    ''

  return {
    id,
    externalId: id,
    ticketId,
    authorId: pickStr(raw.app_user?.id) ?? '',
    authorType,
    body,
    type,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'chaskiq',
    metadata: strMap({ fromBot: raw.from_bot }),
    raw,
  }
}
