/**
 * HelpCenter.io article → Ticket transform.
 *
 * HelpCenter.io is a knowledge-base platform; articles are the primary
 * support resource. They are mapped to Ticket as follows:
 *   published=true  → status='resolved'  (article is live / "resolved")
 *   published=false → status='open'      (draft / "open")
 *   channel         → 'web'              (KB articles are web-based)
 *
 * Multilingual fields (title, slug, content) are returned as
 * { en: "...", de: "..." } objects; we pick the 'en' key with fallback
 * to the first available language value.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Article object returned by GET /v1/articles (no single-resource GET endpoint exists) */
export interface RawHelpcenterArticle {
  _id?: string
  id?: string | number
  slug?: Record<string, string> | string
  title?: Record<string, string> | string
  content?: Record<string, string> | string
  published?: boolean
  visibility?: string
  category_id?: string | null
  categories?: string[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

/** Pick from a multilingual field object; prefer 'en', else first value. */
function pickLang(v: Record<string, string> | string | undefined): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v.length > 0 ? v : undefined
  if (v['en']) return v['en']
  const first = Object.values(v).find((s) => s && s.length > 0)
  return first ?? undefined
}

function mapStatus(published: boolean | undefined): TicketStatus {
  return published === true ? 'resolved' : 'open'
}

function articleId(raw: RawHelpcenterArticle): string {
  // HelpCenter.io uses `_id` (MongoDB ObjectId) as the primary identifier
  return pickStr(raw._id) ?? pickStr(raw.id) ?? ''
}

function articleTitle(raw: RawHelpcenterArticle): string {
  if (raw.title && typeof raw.title === 'object') return pickLang(raw.title) ?? ''
  return pickStr(raw.title as string) ?? ''
}

export function transformTicket(raw: RawHelpcenterArticle): Ticket {
  const id = articleId(raw)
  const status = mapStatus(raw.published)
  const channel: Channel = 'web'
  // Primary category (first in array or explicit category_id)
  const primaryCategory = (raw.categories?.[0]) ?? pickStr(raw.category_id) ?? undefined

  return {
    id,
    externalId: id,
    subject: articleTitle(raw),
    status,
    channel,
    requesterId: '',
    tagIds: [],
    teamId: primaryCategory,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'resolved' ? toIso(raw.updated_at) : undefined,
    platform: 'helpcenter-io',
    metadata: strMap({
      visibility: raw.visibility,
      slug: typeof raw.slug === 'object' ? pickLang(raw.slug as Record<string, string>) : pickStr(raw.slug as string),
    }),
    raw,
  }
}
