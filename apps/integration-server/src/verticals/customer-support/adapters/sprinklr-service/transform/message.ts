/**
 * Transform a Sprinklr message → canonical Message.
 *
 * Source: "POST Read Message (Bulk)", `POST /api/v2/message/bulk-fetch`
 * (https://dev.sprinklr.com/read-messages-bulk). Documented fields used:
 *   messageId  "Refers to the unique identifier for the message sent by the sender"
 *   content.text  "The text of the message"
 *   senderProfile.channelId  "Channel Id associated with the profile on the native"
 *   brandPost  "If true, the message has been sent by the brand"
 *   autoResponse  "If true, then the message was auto published via bot or via rule"
 *   createdTime  "Time at which the message was created"
 *
 * Messages returned for a case's associated message ids are channel messages,
 * so every one is `public`; the docs name no internal-note flag on them.
 */
import type { Message, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSprinklrMessage {
  messageId?: string
  content?: { text?: string; [key: string]: unknown } | null
  senderProfile?: { channelId?: string; [key: string]: unknown } | null
  channelType?: string
  brandPost?: boolean
  autoResponse?: boolean
  createdTime?: number
  [key: string]: unknown
}

function mapAuthorType(raw: RawSprinklrMessage): AuthorType {
  if (raw.autoResponse === true) return 'system'
  if (raw.brandPost === true) return 'user'
  if (raw.brandPost === false) return 'contact'
  return 'unknown'
}

export function transformMessage(raw: RawSprinklrMessage, ticketId: string): Message {
  const id = pickStr(raw.messageId)
  if (!id) throw new Error('Sprinklr message has no messageId')
  const authorId = pickStr(raw.senderProfile?.channelId)
  if (!authorId) throw new Error(`Sprinklr message ${id} has no senderProfile.channelId`)
  const createdAt = toIso(raw.createdTime)
  if (!createdAt) throw new Error(`Sprinklr message ${id} has no createdTime`)

  return {
    id,
    externalId: id,
    ticketId,
    authorId,
    authorType: mapAuthorType(raw),
    body: pickStr(raw.content?.text) ?? '',
    type: 'public',
    createdAt,
    platform: 'sprinklr-service',
    metadata: strMap({
      channelType: raw.channelType,
      brandPost: raw.brandPost,
      autoResponse: raw.autoResponse,
    }),
    raw,
  }
}
