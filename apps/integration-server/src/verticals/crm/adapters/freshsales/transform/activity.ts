import type { Activity } from '../../../schema/activity'

export interface RawFreshsalesTask {
  id: number
  title?: string
  description?: string
  due_date?: string | null
  owner_id?: number | null
  targetable_id?: number | null
  targetable_type?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawFreshsalesTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.title,
    note: raw.description,
    contact_id:
      raw.targetable_type === 'Contact' && raw.targetable_id != null
        ? String(raw.targetable_id)
        : undefined,
    deal_id:
      raw.targetable_type === 'Deal' && raw.targetable_id != null
        ? String(raw.targetable_id)
        : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: raw.due_date ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.contact_id !== undefined) {
    out.targetable_id = Number(data.contact_id)
    out.targetable_type = 'Contact'
  } else if (data.deal_id !== undefined) {
    out.targetable_id = Number(data.deal_id)
    out.targetable_type = 'Deal'
  }
  return out
}
