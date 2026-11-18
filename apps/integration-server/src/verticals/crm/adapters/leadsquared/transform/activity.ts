import type { Activity } from '../../../schema/activity'

export interface RawLeadsquaredActivity {
  ActivityId: string
  EventName?: string
  ActivityNote?: string
  LeadId?: string
  ActivityDate?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawLeadsquaredActivity): Activity {
  return {
    id: String(raw.ActivityId),
    type: raw.EventName,
    subject: raw.EventName,
    note: raw.ActivityNote,
    contact_id: raw.LeadId ? String(raw.LeadId) : undefined,
    due_date: raw.ActivityDate,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.EventName = data.subject
  if (data.note !== undefined) out.ActivityNote = data.note
  return out
}
