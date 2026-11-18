import type { Activity } from '../../../schema/activity'

// Mautic Activity (form submission / event)
export interface RawMauticActivity {
  id?: string | number
  type?: string
  eventType?: string
  event?: string
  timestamp?: string
  contactId?: string | number
  dateAdded?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawMauticActivity): Activity {
  const type = raw.eventType ?? raw.type ?? raw.event
  return {
    id: String(raw.id ?? ''),
    type: type as string | undefined,
    subject: type as string | undefined,
    due_date: raw.timestamp ?? raw.dateAdded,
    done: true,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    created_at: raw.dateAdded,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.eventType = data.type
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  return out
}
