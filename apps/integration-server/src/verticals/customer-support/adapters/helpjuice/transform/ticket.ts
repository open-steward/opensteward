/**
 * Transform a Helpjuice article into the canonical Ticket shape.
 *
 * Helpjuice articles are the closest concept to "tickets" in this vertical.
 * - published=true  → status 'resolved'  (article is live)
 * - published=false → status 'open'      (draft / needs review)
 * - archived articles are treated as 'closed'
 *
 * Channel is always 'web' (knowledge-base articles are web-native).
 * Priority and satisfactionRating are not provided by the API.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHelpjuiceArticle {
  id: number
  name?: string
  description?: string | null
  body?: string | null
  published?: boolean
  archived?: boolean
  category_ids?: number[]
  views?: number
  author_id?: number | null
  keywords?: string[] | null
  url?: string | null
  answer?: {
    body?: string | null
    format?: string | null
    processed_body?: string | null
  } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawHelpjuiceArticle): TicketStatus {
  if (raw.archived) return 'closed'
  if (raw.published) return 'resolved'
  return 'open'
}

const CHANNEL: Channel = 'web'

export function transformTicket(raw: RawHelpjuiceArticle): Ticket {
  const status = mapStatus(raw)
  const categoryIds = (raw.category_ids ?? []).map(String)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: String(raw.id),
    subject: pickStr(raw.name) ?? '',
    status,
    channel: CHANNEL,
    requesterId: raw.author_id ? String(raw.author_id) : '',
    tagIds: categoryIds,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'resolved' ? toIso(raw.updated_at) : undefined,
    closedAt: status === 'closed' ? toIso(raw.updated_at) : undefined,
    platform: 'helpjuice',
    metadata: strMap({
      url: raw.url,
      views: raw.views,
      keywords: Array.isArray(raw.keywords) ? raw.keywords.join(',') : undefined,
    }),
    raw,
  }
}
