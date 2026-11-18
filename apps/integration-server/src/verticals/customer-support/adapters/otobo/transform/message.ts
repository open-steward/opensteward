/**
 * OTOBO article → canonical Message transform.
 *
 * OTOBO calls messages "articles". TicketGet embeds them when called with
 * AllArticles=1; its documented article fields (TicketGet.pm, rel-11_0) are
 * ArticleID, From, To, Cc, Subject, Body, ReplyTo, MessageID, InReplyTo,
 * References, SenderType, SenderTypeID, IsVisibleForCustomer, ContentType,
 * Charset, MimeType, IncomingTime, TimeUnit, and Attachment only when
 * Attachments=1 is sent (it is not: attachment content is refused).
 *
 * IsVisibleForCustomer 1 → public reply, 0 → internal note.
 * SenderType uses the default sender types from otobo-initial_insert.xml:
 * 'agent' → user, 'customer' → contact, 'system' → system.
 * IncomingTime is a unix timestamp in seconds (ArticleGet(): IncomingTime =>
 * 1490690026), so it carries no time-zone ambiguity.
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOtoboArticle {
  ArticleID?: number | string
  From?: string
  To?: string
  Cc?: string
  Subject?: string
  Body?: string
  ContentType?: string
  MimeType?: string
  SenderType?: string
  SenderTypeID?: number | string
  IsVisibleForCustomer?: number | string
  /** Unix timestamp (seconds). */
  IncomingTime?: number | string
  Attachment?: unknown[]
  [key: string]: unknown
}

const AUTHOR_BY_SENDER_TYPE: Record<string, AuthorType> = {
  agent: 'user',
  customer: 'contact',
  system: 'system',
}

function mapType(visible: RawOtoboArticle['IsVisibleForCustomer']): MessageType {
  if (visible === 1 || visible === '1') return 'public'
  if (visible === 0 || visible === '0') return 'internal'
  return 'unknown'
}

export function transformMessage(raw: RawOtoboArticle, ticketId: string): Message {
  if (raw.ArticleID == null || raw.ArticleID === '') {
    throw new Error(`otobo article on ticket ${ticketId} has no ArticleID`)
  }
  const incoming = Number(raw.IncomingTime)
  if (raw.IncomingTime === undefined || raw.IncomingTime === '' || !Number.isFinite(incoming)) {
    throw new Error(`otobo article ${String(raw.ArticleID)} has no IncomingTime`)
  }

  return {
    id: String(raw.ArticleID),
    externalId: String(raw.ArticleID),
    ticketId,
    authorId: pickStr(raw.From) ?? '',
    authorType: (raw.SenderType && AUTHOR_BY_SENDER_TYPE[raw.SenderType]) || 'unknown',
    body: pickStr(raw.Body) ?? '',
    type: mapType(raw.IsVisibleForCustomer),
    attachmentCount: Array.isArray(raw.Attachment) ? raw.Attachment.length : undefined,
    createdAt: new Date(incoming * 1000).toISOString(),
    platform: 'otobo',
    metadata: strMap({
      subject: raw.Subject,
      mimeType: raw.MimeType,
      contentType: raw.ContentType,
      senderType: raw.SenderType,
    }),
    raw,
  }
}
