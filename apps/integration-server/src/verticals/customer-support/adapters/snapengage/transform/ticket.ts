/**
 * SnapEngage case → canonical Ticket.
 *
 * SnapEngage is a live-chat platform. "Cases" are chat sessions.
 * A case is always a chat; statuses are derived from chat_responded
 * and presence of the record (there is no explicit status field).
 * All cases map to channel = 'chat'.
 */
import type { Ticket, TicketStatus, Channel } from '../../../schema'
import { pickStr, pickNum, strMap } from './shared'

export interface RawSnapengageRequesterDetails {
  name?: string
  emails?: string[]
  phones?: string[]
  social_profile_links?: string[]
  age?: number
  notes?: string
  avatars?: string[]
  other_data?: string[]
  [key: string]: unknown
}

export interface RawSnapengageCase {
  /** UUID */
  id?: string
  /** SnapEngage admin URL for the case */
  url?: string
  /** e.g. "chat" */
  type?: string
  /** Primary requester email */
  requested_by?: string
  requester_details?: RawSnapengageRequesterDetails
  description?: string
  /** Unix epoch in milliseconds */
  created_at_date?: number
  created_at_seconds?: number
  created_at_milliseconds?: number
  proactive_chat?: boolean
  page_url?: string
  referrer_url?: string
  entry_url?: string
  ip_address?: string
  user_agent?: string
  browser?: string
  os?: string
  country_code?: string
  country?: string
  region?: string
  city?: string
  latitude?: number
  longitude?: number
  source_id?: number
  chat_waittime?: number
  chat_duration?: number
  /** Whether a human agent responded */
  chat_responded?: boolean
  chat_agent_id?: string
  chat_agent_alias?: string
  /** Survey score (0-10 or similar); normalised to 1-5 */
  survey_score?: number
  survey_comments?: string
  language_code?: string
  transcripts?: Array<{
    id?: string
    date?: number
    date_seconds?: number
    date_milliseconds?: number
    alias?: string
    message?: string
    [key: string]: unknown
  }>
  javascript_variables?: Array<{ name?: string; value?: string }>
  operator_variables?: Array<{ name?: string; value?: string }>
  labels?: Array<{ name?: string; value?: string }>
  destination_url?: string
  visitor_transcript_email?: string
  [key: string]: unknown
}

function mapStatus(raw: RawSnapengageCase): TicketStatus {
  // SnapEngage doesn't expose an explicit status; derive from chat_responded.
  // All retrieved cases are past events — treat as resolved.
  if (raw.chat_responded === false) return 'open'
  return 'resolved'
}

function mapChannel(_raw: RawSnapengageCase): Channel {
  // SnapEngage is a live-chat platform — every case is a chat session.
  return 'chat'
}

function mapRating(raw: RawSnapengageCase): number | undefined {
  const score = pickNum(raw.survey_score)
  if (score == null) return undefined
  // SnapEngage survey scores vary by configuration; clamp to 1-5.
  const clamped = Math.max(1, Math.min(5, Math.round(score)))
  return clamped
}

function toIsoFromMs(ms: number | undefined): string | undefined {
  if (ms == null || ms === 0) return undefined
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function extractLabels(raw: RawSnapengageCase): string[] {
  return (raw.labels ?? [])
    .map((l) => pickStr(l.name))
    .filter((s): s is string => s !== undefined)
}

export function transformTicket(raw: RawSnapengageCase): Ticket {
  const status = mapStatus(raw)
  const id = pickStr(raw.id) ?? ''
  const createdAtMs = raw.created_at_date ?? (raw.created_at_seconds ? raw.created_at_seconds * 1000 : undefined)
  const createdAt = toIsoFromMs(createdAtMs) ?? new Date(0).toISOString()

  return {
    id,
    externalId: id,
    subject: pickStr(raw.description) ?? pickStr(raw.page_url) ?? 'Chat session',
    status,
    channel: mapChannel(raw),
    requesterId: pickStr(raw.requested_by) ?? '',
    assigneeId: pickStr(raw.chat_agent_id),
    tagIds: extractLabels(raw),
    satisfactionRating: mapRating(raw),
    createdAt,
    resolvedAt: status === 'resolved' ? createdAt : undefined,
    platform: 'snapengage',
    metadata: strMap({
      type: raw.type,
      chatAgentAlias: raw.chat_agent_alias,
      pageUrl: raw.page_url,
      languageCode: raw.language_code,
      country: raw.country,
      browser: raw.browser,
      proactiveChat: raw.proactive_chat,
    }),
    raw,
  }
}
