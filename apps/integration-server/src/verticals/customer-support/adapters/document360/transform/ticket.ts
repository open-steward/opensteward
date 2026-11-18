/**
 * Maps a Document360 Article to the canonical Ticket shape.
 *
 * Document360 is a knowledge-base platform; "articles" are the closest
 * concept to support tickets. Status maps to the article's publish status:
 *   0 = Draft  → open
 *   3 = Published → resolved
 *
 * Docs: https://apidocs.document360.com/apidocs/get-article
 */
import type { Ticket, TicketStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawDocument360Article {
  id: string
  title?: string
  /** 0 = Draft, 3 = Published; other values are intermediate workflow states */
  status?: number
  slug?: string
  url?: string
  /** ID of the team account who created the article */
  created_by?: string
  /** Language code, e.g. "en" */
  lang_code?: string
  category_id?: string
  /** "markdown" | "wysiwyg" | "block" */
  content_type?: string
  created_at?: string
  modified_at?: string
  [key: string]: unknown
}

function mapArticleStatus(status: number | undefined): TicketStatus {
  switch (status) {
    case 3:
      return 'resolved'  // Published
    case 0:
      return 'open'      // Draft
    default:
      return 'pending'   // Any workflow/review state
  }
}

export function transformTicket(raw: RawDocument360Article): Ticket {
  const ticketStatus = mapArticleStatus(raw.status)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: pickStr(raw.slug) ?? String(raw.id),
    subject: pickStr(raw.title) ?? '',
    status: ticketStatus,
    priority: undefined,
    channel: 'web',
    requesterId: pickStr(raw.created_by) ?? '',
    assigneeId: undefined,
    teamId: raw.category_id ? String(raw.category_id) : undefined,
    tagIds: [],
    parentTicketId: undefined,
    satisfactionRating: undefined,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.modified_at),
    resolvedAt: ticketStatus === 'resolved' ? toIso(raw.modified_at) : undefined,
    platform: 'document360',
    metadata: strMap({
      contentType: raw.content_type,
      langCode: raw.lang_code,
      url: raw.url,
    }),
    raw,
  }
}
