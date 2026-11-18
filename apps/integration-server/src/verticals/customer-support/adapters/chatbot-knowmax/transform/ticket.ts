/**
 * Transforms a Knowmax Article (or FAQ) into the canonical Ticket shape.
 *
 * Knowmax articles map to Ticket because an article is the closest
 * analogue to a knowledge-base item in the customer-support vertical.
 *
 * Knowmax article response shape (from the published Postman collection):
 * {
 *   id: number,
 *   title: string,
 *   content: string,          // HTML body
 *   status: string,           // 'published' | 'draft' | 'archived'
 *   category_id: number | null,
 *   type: string,             // 'article' | 'faq' | 'decision_tree' | 'visual_guide'
 *   author_id: number | null,
 *   created_at: string,       // ISO-8601
 *   updated_at: string,       // ISO-8601
 *   published_at: string | null,
 *   tags: string[],
 *   views: number,
 *   [key: string]: unknown
 * }
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKnowmaxArticle {
  id: number | string
  title?: string
  content?: string
  status?: string
  category_id?: number | string | null
  type?: string
  author_id?: number | string | null
  created_at?: string
  updated_at?: string
  published_at?: string | null
  tags?: string[]
  views?: number
  [key: string]: unknown
}

function mapStatus(s: string | undefined): TicketStatus {
  switch (s) {
    case 'published':
      return 'open'
    case 'draft':
      return 'pending'
    case 'archived':
      return 'closed'
    default:
      return 'open'
  }
}

function mapChannel(type: string | undefined): Channel {
  // Knowledge articles are served via web; decision trees via chat
  if (type === 'decision_tree') return 'chat'
  return 'web'
}

export function transformArticle(raw: RawKnowmaxArticle): Ticket {
  const status = mapStatus(raw.status)
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.title) ?? '',
    status,
    channel: mapChannel(raw.type),
    requesterId: raw.author_id ? String(raw.author_id) : '',
    teamId: raw.category_id ? String(raw.category_id) : undefined,
    tagIds: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'closed' ? (toIso(raw.updated_at) ?? undefined) : undefined,
    platform: 'chatbot-knowmax',
    metadata: strMap({
      type: raw.type,
      status: raw.status,
      views: raw.views,
      publishedAt: raw.published_at,
    }),
    raw,
  }
}
