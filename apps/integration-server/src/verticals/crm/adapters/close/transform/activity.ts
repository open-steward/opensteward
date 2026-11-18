import type { Activity } from '../../../schema/activity'

/**
 * Close activity — base shape shared across all activity types.
 * Type-specific fields (call duration, email subject, etc.) are captured
 * in metadata.
 */
export interface RawCloseActivity {
  id: string
  _type?: string
  type?: string
  user_id?: string
  lead_id?: string
  contact_id?: string
  opportunity_id?: string
  date_created?: string
  date_updated?: string
  // Note-type field
  note?: string
  // Task-type fields
  text?: string
  due_date?: string
  is_complete?: boolean
  // Call-type fields
  duration?: number
  [key: string]: unknown
}

function mapType(raw: RawCloseActivity): string | undefined {
  // _type is the activity class in Close, e.g. "Note", "Call", "Email", "Task"
  const t = raw._type ?? raw.type ?? ''
  return t.toLowerCase() || undefined
}

export function transformActivity(raw: RawCloseActivity): Activity {
  return {
    id: raw.id,
    type: mapType(raw),
    subject: raw.text,
    note: raw.note,
    contact_id: raw.contact_id,
    company_id: raw.lead_id,
    deal_id: raw.opportunity_id,
    owner_id: raw.user_id,
    due_date: raw.due_date,
    done: raw.is_complete,
    duration_minutes: raw.duration != null ? Math.round(raw.duration / 60) : undefined,
    created_at: raw.date_created,
    updated_at: raw.date_updated,
    metadata: raw,
  }
}

// Activities are read-only in this adapter (type-specific create/update are not implemented).
// untransformActivity is included for completeness but not called from index.ts.
export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.lead_id = data.company_id
  if (data.deal_id !== undefined) out.opportunity_id = data.deal_id
  if (data.owner_id !== undefined) out.user_id = data.owner_id
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.is_complete = data.done
  return out
}
