import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * Raw Accelo activity object as returned by GET /activities or GET /activities/{id}.
 *
 * Activities in Accelo represent any communication or interaction:
 * Note, Email, Meeting, Call, Postal, etc.
 *
 * Default fields: id, subject, body, medium, against_type, against_id,
 *                 owner_id, date_created, date_started, date_modified, standing.
 */
export interface RawAcceloActivity {
  id: string | number
  subject?: string
  body?: string
  /** medium: Note | Email | Meeting | Call | Postal | etc. */
  medium?: string
  against_type?: string
  against_id?: string | number
  owner_id?: string | number
  /** date_created is a unix timestamp (seconds). */
  date_created?: string | number
  date_started?: string | number
  date_ended?: string | number
  date_modified?: string | number
  /** standing: draft | sent | complete | etc. */
  standing?: string
  /** billable time in seconds */
  billable?: string | number
  /** nonbillable time in seconds */
  nonbillable?: string | number
  [key: string]: unknown
}

/** Map Accelo medium to canonical activity type. */
function mediumToType(medium: string | undefined): string {
  if (!medium) return 'note'
  const m = medium.toLowerCase()
  if (m === 'email') return 'email'
  if (m === 'meeting') return 'meeting'
  if (m === 'call') return 'call'
  if (m === 'note') return 'note'
  return m
}

/** Sum billable + nonbillable seconds, convert to minutes. */
function durationMinutes(
  billable: string | number | undefined,
  nonbillable: string | number | undefined,
): number | undefined {
  const b = billable != null ? parseInt(String(billable), 10) : 0
  const nb = nonbillable != null ? parseInt(String(nonbillable), 10) : 0
  const totalSeconds = (isNaN(b) ? 0 : b) + (isNaN(nb) ? 0 : nb)
  if (totalSeconds <= 0) return undefined
  return Math.round(totalSeconds / 60)
}

export function transformActivity(raw: RawAcceloActivity): Activity {
  // Resolve against_ fields to canonical contact/company/deal IDs
  let contactId: string | undefined
  let companyId: string | undefined
  let dealId: string | undefined

  if (raw.against_id != null && raw.against_type != null) {
    const id = String(raw.against_id)
    const type = raw.against_type.toLowerCase()
    if (type === 'contact') contactId = id
    else if (type === 'company' || type === 'affiliation') companyId = id
    else if (type === 'prospect') dealId = id
  }

  const done = raw.standing != null
    ? ['complete', 'sent', 'approved'].includes(raw.standing.toLowerCase())
    : undefined

  return {
    id: String(raw.id),
    type: mediumToType(raw.medium),
    subject: raw.subject ?? undefined,
    note: raw.body ?? undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    contact_id: contactId,
    company_id: companyId,
    deal_id: dealId,
    done: done ?? undefined,
    duration_minutes: durationMinutes(raw.billable, raw.nonbillable),
    created_at: toIsoDatetime(raw.date_created),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.body = data.note
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.type !== undefined) {
    // Map canonical type back to Accelo medium
    const typeMap: Record<string, string> = {
      email: 'Email',
      meeting: 'Meeting',
      call: 'Call',
      note: 'Note',
    }
    out.medium = typeMap[data.type] ?? 'Note'
  }
  if (data.contact_id !== undefined) {
    out.against_type = 'contact'
    out.against_id = data.contact_id
  } else if (data.company_id !== undefined) {
    out.against_type = 'company'
    out.against_id = data.company_id
  } else if (data.deal_id !== undefined) {
    out.against_type = 'prospect'
    out.against_id = data.deal_id
  }
  return out
}
