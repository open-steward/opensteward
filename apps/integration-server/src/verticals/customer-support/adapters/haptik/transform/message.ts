/**
 * Transform one Haptik chat-transcript entry into the canonical Message type.
 *
 * Source: "Get Chat Transcripts v2.0",
 * https://docs.haptik.ai/en_US/developer-guides/what-are-the-different-apis-that-can-be-used-on-conversation-studio
 *
 *   {
 *    "chat_json": [
 *    {
 *    "text": "Search places to visit{task}",
 *    "sender": "user",
 *    "message_id": 1742,
 *    "timestamp": "06/22/20 07:24:25 AM UTC"
 *    }, ...
 *
 * Sender values (documented):
 *   bot          "message was sent by the bot"
 *   user         "message was sent by the user"
 *   <agent_name> "message is sent by an agent, <agent_name> is the name of the
 *                 agent who sent the message"
 *
 * Field mapping:
 *   message_id → id / externalId
 *   text       → body
 *   sender     → authorType (user → contact, bot → system, anything else → user)
 *   sender     → authorId, except for the end user, whose documented identifier
 *                is the transcript's `user_name` request parameter
 *   timestamp  → createdAt
 *
 * The transcript documents no internal-note flag, so every entry is public.
 */
import type { Message, AuthorType } from '../../../schema'

export interface RawHaptikMessage {
  text?: string
  sender?: string
  message_id?: number | string
  timestamp?: string
  [key: string]: unknown
}

/** The documented transcript timestamp shape, e.g. "06/22/20 07:24:25 AM UTC". */
const TIMESTAMP = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM) UTC$/

/**
 * Parse Haptik's "MM/DD/YY hh:mm:ss AM UTC" transcript timestamp to ISO-8601.
 * The documented example "06/22/20" has 22 in the second field, so the order
 * is month/day/year. Throws on anything else rather than guessing a date.
 */
export function parseHaptikTimestamp(value: string | undefined): string {
  const m = typeof value === 'string' ? TIMESTAMP.exec(value) : null
  if (!m)
    throw new Error(
      `Haptik transcript timestamp is not "MM/DD/YY hh:mm:ss AM UTC": ${String(value)}`,
    )
  const [, mm, dd, yy, hh, mi, ss, ampm] = m
  let hour = Number(hh) % 12
  if (ampm === 'PM') hour += 12
  const d = new Date(
    Date.UTC(2000 + Number(yy), Number(mm) - 1, Number(dd), hour, Number(mi), Number(ss)),
  )
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(dd)) {
    throw new Error(`Haptik transcript timestamp is not a valid date: ${value}`)
  }
  return d.toISOString()
}

function mapAuthorType(sender: string): AuthorType {
  if (sender === 'user') return 'contact'
  if (sender === 'bot') return 'system'
  return 'user'
}

/**
 * @param ticketId the conversation's canonical id
 * @param userName the transcript's documented `user_name`, the end user's identifier
 */
export function transformMessage(
  raw: RawHaptikMessage,
  ticketId: string,
  userName: string,
): Message {
  if (raw.message_id === undefined || raw.message_id === null || raw.message_id === '') {
    throw new Error('Haptik transcript entry has no message_id')
  }
  if (typeof raw.sender !== 'string' || raw.sender === '') {
    throw new Error(`Haptik transcript entry ${String(raw.message_id)} has no sender`)
  }
  const id = String(raw.message_id)
  const sender = raw.sender
  return {
    id,
    externalId: id,
    ticketId,
    authorId: sender === 'user' ? userName : sender,
    authorType: mapAuthorType(sender),
    body: typeof raw.text === 'string' ? raw.text : '',
    type: 'public',
    createdAt: parseHaptikTimestamp(raw.timestamp),
    platform: 'haptik',
    metadata: { sender },
    raw,
  }
}
