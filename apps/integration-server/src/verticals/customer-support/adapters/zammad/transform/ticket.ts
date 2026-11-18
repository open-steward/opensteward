/**
 * Zammad ticket transform.
 *
 * Zammad returns plain ticket objects (no envelope wrapper).
 *
 * State IDs (defaults): 1=new, 2=open, 3=pending reminder, 4=closed,
 *   5=merged, 6=removed, 7=pending close
 * Priority IDs (defaults): 1=1 low, 2=2 normal, 3=3 high, 4=4 disaster
 *
 * Docs: https://docs.zammad.org/en/latest/api/ticket/tickets.html
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZammadTicket {
  id: number
  number?: string | number
  title?: string
  /** Resolved state name when ?expand=true is used, e.g. "open" */
  state?: string
  /** Numeric state ID (default Zammad schema) */
  state_id?: number
  /** Resolved priority name when ?expand=true is used, e.g. "2 normal" */
  priority?: string
  /** Numeric priority ID */
  priority_id?: number
  /** Resolved group name when ?expand=true */
  group?: string
  group_id?: number
  owner_id?: number | null
  customer_id?: number
  organization_id?: number | null
  article_count?: number
  article_ids?: number[]
  /** Tags attached to this ticket */
  tags?: string[]
  create_article_type_id?: number
  create_article_sender_id?: number
  created_at?: string
  updated_at?: string
  close_at?: string | null
  last_contact_at?: string | null
  last_contact_agent_at?: string | null
  last_contact_customer_at?: string | null
  [key: string]: unknown
}

/**
 * Map Zammad state name or state_id to canonical TicketStatus.
 * State IDs are default Zammad values; installations may customise them.
 * We prefer the human-readable state name when available (expand=true).
 */
function mapStatus(raw: RawZammadTicket): TicketStatus {
  const name = (raw.state ?? '').toLowerCase()
  if (name) {
    if (name === 'new' || name === 'open') return 'open'
    if (name.startsWith('pending')) return 'pending'
    if (name === 'closed' || name === 'merged') return 'closed'
    if (name === 'removed') return 'closed'
  }
  // Fallback to numeric state_id (default Zammad mapping)
  switch (raw.state_id) {
    case 1: return 'open'   // new
    case 2: return 'open'   // open
    case 3: return 'pending' // pending reminder
    case 4: return 'closed' // closed
    case 5: return 'closed' // merged
    case 6: return 'closed' // removed
    case 7: return 'pending' // pending close
    default: return 'open'
  }
}

/**
 * Map Zammad priority name or priority_id to canonical TicketPriority.
 * Default names include a numeric prefix ("1 low", "2 normal", "3 high").
 */
function mapPriority(raw: RawZammadTicket): TicketPriority | undefined {
  const name = (raw.priority ?? '').toLowerCase()
  if (name.includes('low')) return 'low'
  if (name.includes('normal')) return 'normal'
  if (name.includes('high')) return 'high'
  if (name.includes('urgent') || name.includes('disaster') || name.includes('critical')) return 'urgent'
  // Fallback to numeric priority_id
  switch (raw.priority_id) {
    case 1: return 'low'
    case 2: return 'normal'
    case 3: return 'high'
    case 4: return 'urgent'
    default: return undefined
  }
}

/**
 * Map Zammad article type to canonical Channel.
 * Article type_id 1=email,2=phone,3=web,4=note,5=sms,6=chat,7=fax
 * We use the resolved "type" name when expand=true, else fall through.
 */
function mapChannel(articleTypeName?: string, createTypeId?: number): Channel {
  const t = (articleTypeName ?? '').toLowerCase()
  if (t === 'email') return 'email'
  if (t === 'phone') return 'voice'
  if (t === 'sms') return 'sms'
  if (t === 'chat') return 'chat'
  if (t === 'web' || t === 'api') return 'web'
  if (t === 'twitter' || t === 'facebook' || t === 'telegram') return 'social'
  if (t === 'note' || t === 'fax') return 'other'
  // Fallback numeric
  switch (createTypeId) {
    case 1: return 'email'
    case 2: return 'voice'
    case 3: return 'web'
    case 5: return 'sms'
    case 6: return 'chat'
    default: return 'other'
  }
}

export function transformTicket(raw: RawZammadTicket): Ticket {
  const status = mapStatus(raw)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: raw.number !== undefined ? String(raw.number) : String(raw.id),
    subject: pickStr(raw.title) ?? '',
    status,
    priority: mapPriority(raw),
    channel: mapChannel(undefined, raw.create_article_type_id),
    requesterId: raw.customer_id !== undefined ? String(raw.customer_id) : '',
    assigneeId: raw.owner_id ? String(raw.owner_id) : undefined,
    teamId: raw.group_id ? String(raw.group_id) : undefined,
    tagIds: Array.isArray(raw.tags) ? raw.tags : [],
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(raw.updated_at),
    resolvedAt: status === 'closed'
      ? (toIso(raw.close_at) ?? toIso(raw.updated_at))
      : undefined,
    platform: 'zammad',
    metadata: strMap({
      stateId: raw.state_id,
      priorityId: raw.priority_id,
      groupId: raw.group_id,
      articleCount: raw.article_count,
      organizationId: raw.organization_id,
    }),
    raw,
  }
}
