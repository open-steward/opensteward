import type { Activity } from '../../../schema/activity'

// TODO: Confirm Ortto activity endpoint and field names.
// Ortto tracks activities/events but the API for listing them is not fully documented.
export interface RawOrttoActivity {
  id?: string
  type?: string
  description?: string
  person_id?: string
  created_time?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawOrttoActivity): Activity {
  return {
    id: String(raw.id ?? ''),
    type: raw.type,
    note: raw.description,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    created_at: raw.created_time,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.note !== undefined) out.description = data.note
  if (data.contact_id !== undefined) out.person_id = data.contact_id
  return out
}
