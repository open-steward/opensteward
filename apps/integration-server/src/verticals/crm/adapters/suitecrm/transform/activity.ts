import type { Activity } from '../../../schema/activity'

// SuiteCRM Calls/Meetings mapped to Activity
export interface RawSuiteCrmActivity {
  id?: string
  module_name?: string
  name?: string
  description?: string
  date_start?: string
  duration_hours?: number | string
  status?: string
  contact_id?: string
  account_id?: string
  parent_id?: string
  parent_type?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawSuiteCrmActivity): Activity {
  const moduleName = raw.module_name as string | undefined
  const done = raw.status === 'Held' || raw.status === 'held'
  return {
    id: String(raw.id ?? ''),
    type: moduleName?.toLowerCase(),
    subject: raw.name,
    note: raw.description,
    due_date: raw.date_start,
    done,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    deal_id: raw.parent_type === 'Opportunities' && raw.parent_id != null
      ? String(raw.parent_id)
      : undefined,
    owner_id: raw.assigned_user_id != null ? String(raw.assigned_user_id) : undefined,
    created_at: raw.date_entered,
    updated_at: raw.date_modified,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.date_start = data.due_date
  if (data.done !== undefined) out.status = data.done ? 'Held' : 'Planned'
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.account_id = data.company_id
  return out
}
