/**
 * Transform a Jira Service Management CommentDTO to canonical Message.
 *
 * JSM comment fields:
 *   id      — comment id
 *   body    — comment text (plain or HTML-ish)
 *   author  — { accountId, displayName, emailAddress }
 *   created — JSM date object { iso8601, epochMillis, ... }
 *   public  — boolean: false means internal note, true means customer-visible
 *
 * Docs: https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface JsmDateDTO {
  epochMillis?: number
  iso8601?: string
  friendly?: string
}

interface JsmAuthorDTO {
  accountId?: string
  displayName?: string
  emailAddress?: string
}

export interface RawJsmComment {
  id?: string | number
  body?: string
  renderedBody?: string
  author?: JsmAuthorDTO
  created?: JsmDateDTO
  public?: boolean
  [key: string]: unknown
}

export function transformMessage(raw: RawJsmComment, ticketId: string): Message {
  // public === false → internal note; public === true or absent → customer-visible
  const type: MessageType = raw.public === false ? 'internal' : 'public'
  // JSM comments are authored by either an agent (user) or a customer (contact).
  // Without expansion the API doesn't distinguish; default to 'user' (agent).
  const authorType: AuthorType = 'user'
  const body = pickStr(raw.body) ?? ''
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    ticketId,
    authorId: pickStr(raw.author?.accountId) ?? '',
    authorType,
    body,
    type,
    attachmentCount: undefined, // Attachments require a separate API call; not fetched here
    createdAt: toIso(raw.created) ?? new Date(0).toISOString(),
    platform: 'jira-service-management',
    metadata: strMap({
      authorDisplayName: raw.author?.displayName,
    }),
    raw,
  }
}
