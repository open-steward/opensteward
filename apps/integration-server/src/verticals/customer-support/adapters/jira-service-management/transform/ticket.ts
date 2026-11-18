/**
 * Transform a Jira Service Management CustomerRequestDTO to canonical Ticket.
 *
 * Key JSM fields:
 *   issueId        — numeric string, used as canonical id
 *   issueKey       — human-readable key, e.g. "IT-42"
 *   summary        — request subject line
 *   currentStatus  — { status: string, statusCategory: string, statusDate: {...} }
 *   reporter       — { accountId, displayName, emailAddress }
 *   requestFieldValues — array of { fieldId, label, value }
 *   createdDate    — JSM date object { iso8601, epochMillis, ... }
 *   serviceDeskId  — ID of the owning service desk (maps to teamId)
 *   requestTypeId  — type of request
 *
 * Docs: https://developer.atlassian.com/cloud/jira/service-desk/rest/api-group-request/
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** JSM date shape returned in createdDate, statusDate, etc. */
interface JsmDateDTO {
  epochMillis?: number
  iso8601?: string
  friendly?: string
  jira?: string
}

/** Status shape from currentStatus field */
interface JsmCurrentStatus {
  status?: string
  statusCategory?: string
  statusDate?: JsmDateDTO
}

/** User shape in reporter / participants */
interface JsmUserDTO {
  accountId?: string
  displayName?: string
  emailAddress?: string
}

/** Single field value from requestFieldValues */
interface JsmFieldValue {
  fieldId?: string
  label?: string
  value?: unknown
}

export interface RawJsmRequest {
  issueId?: string
  issueKey?: string
  summary?: string
  requestTypeId?: string
  serviceDeskId?: string
  createdDate?: JsmDateDTO
  reporter?: JsmUserDTO
  currentStatus?: JsmCurrentStatus
  requestFieldValues?: JsmFieldValue[]
  participants?: JsmUserDTO[]
  [key: string]: unknown
}

/** Extract a named field from requestFieldValues by fieldId */
function fieldValue(raw: RawJsmRequest, fieldId: string): string | undefined {
  const fv = (raw.requestFieldValues ?? []).find((f) => f.fieldId === fieldId)
  if (!fv) return undefined
  const v = fv.value
  if (v == null) return undefined
  if (typeof v === 'string') return v || undefined
  if (typeof v === 'object') {
    // Some fields return { value: "...", id: "..." } objects
    const obj = v as Record<string, unknown>
    if (typeof obj['value'] === 'string') return obj['value'] || undefined
    if (typeof obj['name'] === 'string') return obj['name'] || undefined
  }
  return String(v) || undefined
}

function mapStatus(s: JsmCurrentStatus | undefined): TicketStatus {
  const name = (s?.status ?? '').toLowerCase()
  const cat = (s?.statusCategory ?? '').toLowerCase()
  if ((name.includes('closed')) || (cat === 'done' && name.includes('clos'))) return 'closed'
  if (name.includes('resolved') || name.includes('done') || cat === 'done') return 'resolved'
  if (name.includes('pending') || name.includes('waiting')) return 'pending'
  if (name.includes('hold') || name.includes('on hold')) return 'on_hold'
  if (name.includes('progress') || name.includes('work')) return 'in_progress'
  if (cat === 'in progress') return 'in_progress'
  if (cat === 'to do' || cat === 'new') return 'open'
  return 'open'
}

function mapPriority(raw: RawJsmRequest): TicketPriority | undefined {
  // Priority may appear as a requestFieldValue with fieldId 'priority'
  const pStr = fieldValue(raw, 'priority')
  if (!pStr) return undefined
  const p = pStr.toLowerCase()
  if (p.includes('low')) return 'low'
  if (p.includes('medium') || p.includes('normal')) return 'normal'
  if (p.includes('high')) return 'high'
  if (p.includes('urgent') || p.includes('critical')) return 'urgent'
  return undefined
}

function mapChannel(raw: RawJsmRequest): Channel {
  // JSM channel is sometimes in a requestFieldValue with fieldId 'channel'
  const ch = fieldValue(raw, 'channel')?.toLowerCase()
  if (ch?.includes('email')) return 'email'
  if (ch?.includes('chat') || ch?.includes('portal') || ch?.includes('web')) return 'web'
  if (ch?.includes('phone') || ch?.includes('voice')) return 'voice'
  // Default for JSM: requests come through the portal (web)
  return 'web'
}

export function transformTicket(raw: RawJsmRequest): Ticket {
  const status = mapStatus(raw.currentStatus)
  const createdAt = toIso(raw.createdDate) ?? new Date(0).toISOString()
  const updatedAt = toIso(raw.currentStatus?.statusDate)
  const isTerminal = status === 'resolved' || status === 'closed'
  return {
    id: pickStr(raw.issueId) ?? pickStr(raw.issueKey) ?? '',
    externalId: pickStr(raw.issueId) ?? pickStr(raw.issueKey) ?? '',
    number: pickStr(raw.issueKey),
    subject: pickStr(raw.summary) ?? '',
    status,
    priority: mapPriority(raw),
    channel: mapChannel(raw),
    requesterId: pickStr(raw.reporter?.accountId) ?? '',
    assigneeId: undefined, // JSM does not expose assignee on the CustomerRequestDTO
    teamId: pickStr(raw.serviceDeskId),
    tagIds: [],
    satisfactionRating: undefined,
    createdAt,
    updatedAt,
    resolvedAt: isTerminal ? (updatedAt ?? createdAt) : undefined,
    platform: 'jira-service-management',
    metadata: strMap({
      issueKey: raw.issueKey,
      requestTypeId: raw.requestTypeId,
      serviceDeskId: raw.serviceDeskId,
      statusCategory: raw.currentStatus?.statusCategory,
      rawStatus: raw.currentStatus?.status,
    }),
    raw,
  }
}
