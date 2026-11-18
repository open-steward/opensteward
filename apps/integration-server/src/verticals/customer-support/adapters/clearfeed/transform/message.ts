/**
 * Transform a ClearFeed message object (from request include=messages) into
 * the canonical Message schema.
 *
 * Messages are fetched inline: GET /v1/rest/requests/:id?include=messages
 * or GET /v1/rest/requests?include=messages.
 *
 * ClearFeed message object (inside request.messages[]):
 *  - text       → body (plain text from Slack)
 *  - author     → authorId (Slack user ID)
 *  - ts         → used as id (Slack message timestamp)
 *  - is_responder → authorType: 'user' (responder/agent) or 'contact' (requester/customer)
 *  - is_private → type: 'internal' (true) | 'public' (false)
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawClearfeedMessage {
  /** Slack message timestamp — used as unique ID. */
  ts?: string | null
  thread_ts?: string | null
  text?: string | null
  author?: string | null
  is_responder?: boolean | null
  is_private?: boolean | null
  [key: string]: unknown
}

export function transformMessage(raw: RawClearfeedMessage, ticketId: string): Message {
  const type: MessageType = raw.is_private === true ? 'internal' : 'public'
  const authorType: AuthorType = raw.is_responder === true ? 'user' : 'contact'
  // Use Slack ts as id — it is unique per channel; prefix with ticketId for global uniqueness.
  const ts = pickStr(raw.ts) ?? ''
  const id = ts ? `${ticketId}:${ts}` : ticketId

  // Slack timestamps are Unix epoch with microseconds (e.g. "1670011050.128179").
  const createdAt: string = (() => {
    if (!ts) return new Date(0).toISOString()
    const epochMs = parseFloat(ts) * 1000
    const d = new Date(epochMs)
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString()
  })()

  return {
    id,
    externalId: ts || id,
    ticketId,
    authorId: pickStr(raw.author) ?? '',
    authorType,
    body: pickStr(raw.text) ?? '',
    type,
    createdAt,
    platform: 'clearfeed',
    metadata: strMap({
      threadTs: raw.thread_ts,
      slackTs: ts,
    }),
    raw,
  }
}

/**
 * Parse the messages array embedded in a request response (include=messages).
 * Returns an empty array if the messages field is absent/null.
 */
export function transformMessages(
  messages: RawClearfeedMessage[] | null | undefined,
  ticketId: string,
): Message[] {
  if (!Array.isArray(messages)) return []
  return messages.map((m) => transformMessage(m, ticketId))
}
