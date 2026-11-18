/**
 * Desk365 conversation transform.
 *
 * Source: ConversationMessageModel in the Desk365 v3 OpenAPI spec
 * (https://apps.desk365.io/apis/v3/api-docs?group=v3), the items of
 * GET /v3/tickets/conversations. The model carries no public/private flag;
 * the adapter learns which rows are private notes from a second request
 * (`include_*` flags) and passes the type in.
 *
 * `created_on` is "yyyy-MM-dd HH:mm:ss". The spec states the zone on the
 * import endpoints ("\"created_on\" is the date and time in yyyy-MM-dd
 * HH:mm:ss format in UTC"), so it is read as UTC.
 *
 * `body` is read from `body_text` ("Text version of the body") only; the
 * HTML `body` is not substituted. A row without body_text gets '' (the
 * canonical field is a required string, and an attachment-only message has
 * no text), the same convention as the vertical's reference adapter.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawDesk365Conversation {
  id?: number | string | null
  ticket_number?: number | string | null
  created_by?: string | null
  creator_name?: string | null
  sender_type?: string | null
  cc_address?: string | null
  bcc_address?: string | null
  to_address?: string | null
  notified_agents?: string | null
  body?: string | null
  body_text?: string | null
  attachments_count?: number | null
  attachments?: unknown[] | null
  created_on?: string | null
  [key: string]: unknown
}

const DESK365_DATETIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

function parseUtc(s: string | null | undefined): string | undefined {
  const m = DESK365_DATETIME.exec((s ?? '').trim())
  if (!m) return undefined
  const [, y, mo, d, h, mi, se] = m.map(Number)
  const t = Date.UTC(y!, mo! - 1, d!, h!, mi!, se!)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

function mapSender(s: string | null | undefined): AuthorType {
  // "sender_type": "agent" or "contact".
  if (s === 'agent') return 'user'
  if (s === 'contact') return 'contact'
  return 'unknown'
}

export function transformMessage(
  raw: RawDesk365Conversation,
  ticketId: string,
  type: MessageType,
): Message {
  const id = pickStr(raw.id)
  if (!id) throw new Error('deskcom-desk365: conversation has no id')
  const createdAt = parseUtc(raw.created_on)
  if (!createdAt) throw new Error(`deskcom-desk365: conversation ${id} has no readable created_on`)
  const authorId = pickStr(raw.created_by)
  if (!authorId) throw new Error(`deskcom-desk365: conversation ${id} has no created_by`)

  return {
    id,
    externalId: id,
    ticketId,
    authorId,
    authorType: mapSender(raw.sender_type),
    body: pickStr(raw.body_text) ?? '',
    type,
    attachmentCount: typeof raw.attachments_count === 'number' ? raw.attachments_count : undefined,
    createdAt,
    platform: 'deskcom-desk365',
    metadata: strMap({ creatorName: raw.creator_name }),
    raw,
  }
}
