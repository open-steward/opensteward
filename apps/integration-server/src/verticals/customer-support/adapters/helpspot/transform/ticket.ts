/**
 * HelpSpot request -> canonical Ticket transform.
 *
 * HelpSpot request fields (from private.request.get / private.request.search):
 *   xRequest        — request ID (integer)
 *   sTitle          — subject / title
 *   fOpen           — 1=open, 0=closed
 *   xStatus         — numeric status ID (custom per installation)
 *   fUrgent         — 1=urgent, 0=normal
 *   fOpenedVia      — channel code (1-13, see below)
 *   dtGMTOpened     — Unix timestamp, open date/time
 *   dtGMTClosed     — Unix timestamp, close date/time (0 if not closed)
 *   xPersonAssignedTo — assigned staff ID
 *   xCategory       — category ID (used as teamId)
 *   reportingTags   — comma-separated tag IDs
 *   sFirstName      — customer first name
 *   sLastName       — customer last name
 *   sEmail          — customer email
 *   sUserId         — customer external ID
 *
 * fOpenedVia codes:
 *   1=Email, 2=Phone, 3=Walk In, 4=Mail, 5=Other, 6=Web Service,
 *   7=Web Form, 8=Forum, 9=Instant Messenger, 10=Fax, 11=Voicemail,
 *   12=Staff Initiated, 13=Tab Widget
 */
import type { Ticket, TicketStatus, TicketPriority, Channel } from '../../../schema'
import { pickStr, strMap, toIso, pickNum } from './shared'

export interface RawHelpspotRequest {
  xRequest?: number | string
  sTitle?: string
  fOpen?: number | string
  xStatus?: number | string
  fUrgent?: number | string
  fOpenedVia?: number | string
  dtGMTOpened?: number | string
  dtGMTClosed?: number | string
  xPersonAssignedTo?: number | string | null
  xCategory?: number | string | null
  reportingTags?: string
  sFirstName?: string
  sLastName?: string
  sEmail?: string
  sUserId?: string
  [key: string]: unknown
}

function mapStatus(raw: RawHelpspotRequest): TicketStatus {
  const fOpen = pickNum(raw.fOpen)
  if (fOpen === 0) return 'closed'
  return 'open'
}

function mapPriority(raw: RawHelpspotRequest): TicketPriority | undefined {
  const fUrgent = pickNum(raw.fUrgent)
  if (fUrgent === 1) return 'urgent'
  return undefined
}

function mapChannel(code: number | string | undefined): Channel {
  const n = typeof code === 'string' ? Number(code) : code
  switch (n) {
    case 1: return 'email'
    case 2: return 'voice'   // Phone
    case 3: return 'other'   // Walk In
    case 4: return 'other'   // Mail
    case 5: return 'other'   // Other
    case 6: return 'api'     // Web Service
    case 7: return 'web'     // Web Form
    case 8: return 'web'     // Forum
    case 9: return 'chat'    // Instant Messenger
    case 10: return 'other'  // Fax
    case 11: return 'voice'  // Voicemail
    case 12: return 'api'    // Staff Initiated
    case 13: return 'web'    // Tab Widget
    default: return 'other'
  }
}

function parseTags(reportingTags: string | undefined): string[] {
  if (!reportingTags) return []
  return reportingTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function transformTicket(raw: RawHelpspotRequest): Ticket {
  const id = String(raw.xRequest ?? '')
  const status = mapStatus(raw)
  const closedAt = raw.dtGMTClosed && pickNum(raw.dtGMTClosed) !== 0
    ? toIso(raw.dtGMTClosed)
    : undefined

  return {
    id,
    externalId: id,
    number: id,
    subject: pickStr(raw.sTitle) ?? '',
    status,
    priority: mapPriority(raw),
    channel: mapChannel(raw.fOpenedVia),
    requesterId: pickStr(raw.sUserId) ?? pickStr(raw.sEmail) ?? '',
    assigneeId: raw.xPersonAssignedTo ? String(raw.xPersonAssignedTo) : undefined,
    teamId: raw.xCategory ? String(raw.xCategory) : undefined,
    tagIds: parseTags(raw.reportingTags),
    createdAt: toIso(raw.dtGMTOpened) ?? new Date(0).toISOString(),
    resolvedAt: status === 'closed' ? (closedAt ?? toIso(raw.dtGMTClosed)) : undefined,
    closedAt,
    platform: 'helpspot',
    metadata: strMap({
      fOpenedVia: raw.fOpenedVia,
      xStatus: raw.xStatus,
      sFirstName: raw.sFirstName,
      sLastName: raw.sLastName,
      sEmail: raw.sEmail,
    }),
    raw,
  }
}
