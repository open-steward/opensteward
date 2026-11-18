/**
 * Supportbench activity → canonical Message transform.
 *
 * Supportbench exposes case activities (messages/comments) via the
 * POST /activities endpoint. Activity fields:
 *   id, type_id, type, contact_id, contact (name), email_from, email_to,
 *   email_cc, content (HTML), content_plain_text, content_last_reply,
 *   createdby_id, createdby (agent name), public (boolean),
 *   created (ISO datetime), created_unix, attachments[].
 *
 * Docs: https://supportbench.readme.io/reference/activity-object.md
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSupportbenchActivity {
  id?: number | string | null
  type_id?: string | null
  type?: string | null
  type_icon?: string | null
  contact_id?: string | null
  contact?: string | null
  email_from?: string | null
  email_to?: string[] | null
  email_cc?: string[] | null
  content?: string | null
  content_plain_text?: string | null
  content_last_reply?: string | null
  createdby_id?: string | null
  createdby?: string | null
  public?: boolean | null
  created?: string | null
  created_unix?: number | null
  created_ago?: string | null
  attachments?: Array<{ id?: number; name?: string; size?: string; url?: string }>
  // present when returned as embedded activity on a case
  case_id?: string | null
  case_owner?: string | null
  case_status?: string | null
  case_company?: string | null
  case_contact?: string | null
  emotion_score?: number | null
  sentiment_score?: number | null
  outcome?: string | null
  [key: string]: unknown
}

export function transformMessage(raw: RawSupportbenchActivity, ticketId: string): Message {
  const isInternal = raw.public === false
  const type: MessageType = isInternal ? 'internal' : 'public'

  // If createdby_id is set, this was created by an agent (user); otherwise by a contact
  const authorType: AuthorType = raw.createdby_id ? 'user' : 'contact'
  const authorId = pickStr(raw.createdby_id) ?? pickStr(raw.contact_id) ?? ''

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.content_plain_text) ?? pickStr(raw.content) ?? '',
    type,
    attachmentCount: raw.attachments?.length,
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    platform: 'supportbench',
    metadata: strMap({
      activityType: raw.type,
      activityTypeId: raw.type_id,
      emailFrom: raw.email_from,
    }),
    raw,
  }
}
