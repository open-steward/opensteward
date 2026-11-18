/**
 * Transform a Khoros Care conversation message into the canonical Message.
 *
 * Messages come inside the conversation detail
 * (`GET /api/v2/conversations/{lswUuid}` → `data[0].messages[]`). Each carries
 * `lswUuid`, `network`, `author` (`lswUuid`), `publishDate` (epoch ms),
 * `postContent`, `isPrivate`, `tags`, optional `media[]`, and, for a response
 * written by an agent in Care, `respondingAgent` (`name`, `email`, `lswUuid`)
 * and `inResponseToDocLswUuid`:
 *
 *   "For messages that are responses originating in Care by agents, the
 *    payload includes the ID for the message or document being replied to,
 *    the agent who initiated the response, and the body of the post"
 *
 * A message without `respondingAgent` may be the customer's or the brand's
 * own post (the Instagram example opens with the brand's post), so its author
 * type is not stated and is `unknown`.
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/reference/reference-conversation-api
 *       https://developer.khoros.com/khoroscaredevdocs/reference/facebook-conversations
 */
import type { Message } from '../../../schema'
import { epochMsToIso, pickStr, required, strMap } from './shared'

export interface RawKhorosCareMessage {
  lswUuid?: string
  id?: string
  network?: string
  networkinstance?: string
  author?: { lswUuid?: string; id?: string } | null
  respondingAgent?: { name?: string; email?: string; lswUuid?: string } | null
  inResponseToDocLswUuid?: string
  responseHandle?: string
  publishDate?: number
  receiveDate?: number
  postContent?: string
  isPrivate?: boolean
  url?: string
  media?: unknown[]
  [key: string]: unknown
}

export function transformMessage(raw: RawKhorosCareMessage, ticketId: string): Message {
  const id = required(pickStr(raw.lswUuid), `message lswUuid in conversation ${ticketId}`)
  const handle = required(pickStr(raw.author?.lswUuid), `author.lswUuid of message ${id}`)
  const agent = raw.respondingAgent
    ? required(pickStr(raw.respondingAgent.lswUuid), `respondingAgent.lswUuid of message ${id}`)
    : undefined
  return {
    id,
    externalId: id,
    ticketId,
    authorId: agent ?? handle,
    authorType: agent ? 'user' : 'unknown',
    body: raw.postContent ?? '',
    // Every document in `messages` is a network post; Care notes are a
    // separate `notes` array on the conversation, not served here.
    type: 'public',
    attachmentCount: Array.isArray(raw.media) ? raw.media.length : undefined,
    createdAt: required(epochMsToIso(raw.publishDate), `publishDate of message ${id}`),
    platform: 'khoros-care',
    metadata: strMap({
      network: raw.network,
      authorLswUuid: handle,
      networkId: raw.id,
      isPrivate: raw.isPrivate,
      inResponseToDocLswUuid: raw.inResponseToDocLswUuid,
      responseHandle: raw.responseHandle,
      url: raw.url,
    }),
    raw,
  }
}
