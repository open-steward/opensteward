/**
 * Transform SysAid service record → canonical Ticket.
 *
 * SysAid service-record fields (Connect API v1):
 *   id, title, description, status, priority, srType, source,
 *   insertTime, updateTime, closeTime, dueDate,
 *   requestUser, assignee, assignedGroup,
 *   primaryCategory, secondaryCategory, thirdLevelCategory,
 *   solution, resolution
 *
 * Timestamps arrive as ISO-8601 strings from the Connect API.
 * Status and priority are returned as list-objects with { id, value, caption }.
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface SysaidListField {
  id?: number | string
  value?: number | string
  caption?: string
  [key: string]: unknown
}

export interface SysaidUserField {
  id?: number | string
  userName?: string
  firstName?: string
  lastName?: string
  displayName?: string
  [key: string]: unknown
}

export interface RawSysaidServiceRecord {
  id?: number | string
  title?: string
  description?: string
  status?: SysaidListField | string | number
  priority?: SysaidListField | string | number
  srType?: SysaidListField | string
  source?: number | string
  insertTime?: string
  updateTime?: string
  closeTime?: string
  dueDate?: string
  requestUser?: SysaidUserField | string | number
  assignee?: SysaidUserField | string | number
  assignedGroup?: SysaidListField | string | number
  primaryCategory?: SysaidListField | string
  secondaryCategory?: SysaidListField | string
  [key: string]: unknown
}

/**
 * SysAid status captions (not exhaustive — varies by configuration).
 * Numeric IDs: 1=New/Open, 2=Active, 3=Pending, 4=Resolved, 5=Closed
 * are common defaults; caption-based mapping is more reliable.
 */
function mapStatus(raw: SysaidListField | string | number | undefined): TicketStatus {
  if (!raw) return 'open'
  const caption = typeof raw === 'object' ? (raw.caption ?? '') : String(raw)
  const lc = caption.toLowerCase()
  if (lc.includes('new') || lc.includes('open') || lc.includes('active')) return 'open'
  if (lc.includes('pend') || lc.includes('waiting')) return 'pending'
  if (lc.includes('progress') || lc.includes('processing')) return 'in_progress'
  if (lc.includes('hold') || lc.includes('defer')) return 'on_hold'
  if (lc.includes('resolv') || lc.includes('solved') || lc.includes('complet')) return 'resolved'
  if (lc.includes('clos') || lc.includes('cancel')) return 'closed'
  // Fallback: numeric ID heuristic (SysAid default schema)
  const idVal = typeof raw === 'object' ? raw.id : raw
  const id = Number(idVal)
  if (id === 1 || id === 2) return 'open'
  if (id === 3) return 'pending'
  if (id === 4) return 'resolved'
  if (id === 5) return 'closed'
  return 'open'
}

function mapPriority(raw: SysaidListField | string | number | undefined): TicketPriority | undefined {
  if (!raw) return undefined
  const caption = typeof raw === 'object' ? (raw.caption ?? '') : String(raw)
  const lc = caption.toLowerCase()
  if (lc.includes('low')) return 'low'
  if (lc.includes('medium') || lc.includes('normal')) return 'normal'
  if (lc.includes('high')) return 'high'
  if (lc.includes('critical') || lc.includes('urgent')) return 'urgent'
  return undefined
}

/**
 * SysAid source numeric codes (common defaults):
 * 1 = Phone, 2 = Email, 3 = Self-Service Portal, 4 = Chat, 5 = API
 */
function mapSource(source: number | string | undefined): Channel {
  const n = Number(source)
  if (n === 1) return 'voice'
  if (n === 2) return 'email'
  if (n === 3) return 'web'
  if (n === 4) return 'chat'
  if (n === 5) return 'api'
  return 'other'
}

function extractId(field: SysaidUserField | SysaidListField | string | number | undefined): string | undefined {
  if (!field) return undefined
  if (typeof field === 'string' || typeof field === 'number') return String(field)
  const id = field.id
  return id !== undefined && id !== null ? String(id) : undefined
}

export function transformTicket(raw: RawSysaidServiceRecord): Ticket {
  const status = mapStatus(raw.status)
  const requesterId = extractId(raw.requestUser as SysaidUserField | undefined) ?? ''
  const assigneeId = extractId(raw.assignee as SysaidUserField | undefined)
  const teamId = extractId(raw.assignedGroup as SysaidListField | undefined)
  const createdAt = toIso(raw.insertTime) ?? new Date(0).toISOString()
  const updatedAt = toIso(raw.updateTime)
  const closedAt = toIso(raw.closeTime)
  const resolvedAt = (status === 'resolved' || status === 'closed') ? (closedAt ?? updatedAt) : undefined

  const primaryCat = typeof raw.primaryCategory === 'object'
    ? pickStr(raw.primaryCategory?.caption)
    : pickStr(raw.primaryCategory)
  const secondaryCat = typeof raw.secondaryCategory === 'object'
    ? pickStr(raw.secondaryCategory?.caption)
    : pickStr(raw.secondaryCategory)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: String(raw.id ?? ''),
    subject: pickStr(raw.title) ?? '',
    status,
    priority: mapPriority(raw.priority),
    channel: mapSource(raw.source as number | string | undefined),
    requesterId,
    assigneeId,
    teamId,
    tagIds: [],
    resolvedAt,
    closedAt,
    createdAt,
    updatedAt,
    platform: 'sysaid',
    metadata: strMap({
      primaryCategory: primaryCat,
      secondaryCategory: secondaryCat,
      srType: typeof raw.srType === 'object' ? raw.srType?.caption : raw.srType,
      source: raw.source,
    }),
    raw,
  }
}
