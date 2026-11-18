/**
 * Transform a Rasayel Message into the canonical Message shape.
 *
 * `Message` is a GraphQL interface (https://developers.rasayel.io/types/Message)
 * declaring id: Int!, uuid: String!, direction: MessageDirectionEnum!,
 * messageType: MessageTypeEnum!, messageCategory: MessageCategoryEnum!,
 * createdAt: Int!, user: User!. The text lives on the concrete types, read
 * through inline fragments (the shape the "Exporting All Conversations" guide
 * uses: `... on TextMessage { body }`):
 *   - `body` on TextMessage, NoteMessage, RichMessage, FlowResponseMessage and
 *     the InteractiveMessage interface;
 *   - `caption` on ImageMessage, VideoMessage, AudioMessage, DocumentMessage
 *     and AnimationMessage;
 *   - `attachments: [Attachment!]!` on NoteMessage, RichMessage and the media
 *     types (only the count is surfaced).
 * Other message types (action, event, location, contact cards) document no
 * text field and get an empty body. AiSummaryMessage's body is AI-generated
 * and is not requested.
 *
 * `type NoteMessage` is documented as "An internal note that can contain media
 * files of any type", so it is an internal message; every other type is public.
 * The author comes from `user`, whose `__typename` is ChannelUser (the
 * contact), AppUser (a teammate) or BotUser, the three `implements User` types.
 */
import type { Message, AuthorType } from '../../../schema'
import { epochToIso, strMap } from './shared'

export interface RawRasayelMessage {
  __typename: string
  id: number
  uuid: string
  direction: string
  messageType: string
  messageCategory: string
  createdAt: number
  user: { __typename: string; id: number }
  body?: string | null
  caption?: string | null
  attachments?: Array<unknown> | null
}

const AUTHOR: Record<string, AuthorType> = {
  ChannelUser: 'contact',
  AppUser: 'user',
  BotUser: 'system',
}

export function transformMessage(raw: RawRasayelMessage, ticketId: string): Message {
  return {
    id: String(raw.id),
    externalId: raw.uuid,
    ticketId,
    authorId: String(raw.user.id),
    authorType: AUTHOR[raw.user.__typename] ?? 'unknown',
    // `body` and `caption` are selected on disjoint concrete types: at most one is present.
    body: raw.body ?? raw.caption ?? '',
    type: raw.__typename === 'NoteMessage' ? 'internal' : 'public',
    ...(Array.isArray(raw.attachments) ? { attachmentCount: raw.attachments.length } : {}),
    createdAt: epochToIso(raw.createdAt),
    platform: 'rasayel',
    metadata: strMap({
      messageKind: raw.__typename,
      direction: raw.direction,
      messageType: raw.messageType,
      messageCategory: raw.messageCategory,
    }),
    raw,
  }
}
