/**
 * Znuny Article → canonical Message.
 *
 * Articles are embedded in TicketGet responses when AllArticles=1 is passed.
 * There is no standalone article-get REST endpoint.
 *
 * Key fields from Znuny Article:
 *   ArticleID, Subject, Body, From, To, CommunicationChannel,
 *   IsVisibleForCustomer (1=public, 0=internal), SenderType, Created, CreateBy
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import type { RawZnunyArticle } from './ticket'

export { type RawZnunyArticle }

function mapMessageType(isVisible: number | string | undefined): MessageType {
  // IsVisibleForCustomer: 1 = public reply, 0 = internal note
  const v = typeof isVisible === 'string' ? parseInt(isVisible, 10) : isVisible
  return v === 0 ? 'internal' : 'public'
}

function mapAuthorType(senderType: string | undefined): AuthorType {
  const s = (senderType ?? '').toLowerCase()
  if (s === 'customer') return 'contact'
  if (s === 'agent') return 'user'
  if (s === 'system') return 'system'
  return 'user'
}

export function transformMessage(raw: RawZnunyArticle, ticketId: string): Message {
  const type: MessageType = mapMessageType(raw.IsVisibleForCustomer)
  const authorType: AuthorType = mapAuthorType(raw.SenderType)

  return {
    id: String(raw.ArticleID),
    externalId: String(raw.ArticleID),
    ticketId,
    authorId: String(raw.CreateBy ?? ''),
    authorType,
    body: pickStr(raw.Body) ?? '',
    type,
    attachmentCount: raw.Attachment?.length,
    createdAt: toIso(raw.Created) ?? new Date(0).toISOString(),
    platform: 'znuny',
    metadata: strMap({
      subject: raw.Subject,
      from: raw.From,
      communicationChannel: raw.CommunicationChannel,
      senderType: raw.SenderType,
      contentType: raw.ContentType,
    }),
    raw,
  }
}
