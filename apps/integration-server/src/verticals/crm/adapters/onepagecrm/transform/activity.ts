import type { Activity } from '../../../schema/activity'

export interface RawOnePageCrmAction {
  id?: string | number
  action_type_id?: number
  text?: string
  note?: string
  contact_id?: string | number
  deal_id?: string | number
  assignee_id?: string | number
  date?: string
  done?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawOnePageCrmAction): Activity {
  return {
    id: String(raw.id ?? ''),
    type: 'task',
    subject: raw.text ?? undefined,
    note: raw.note ?? undefined,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.assignee_id != null ? String(raw.assignee_id) : undefined,
    due_date: raw.date ?? undefined,
    done: raw.done ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out['text'] = data.subject
  if (data.note !== undefined) out['note'] = data.note
  if (data.contact_id !== undefined) out['contact_id'] = data.contact_id
  if (data.deal_id !== undefined) out['deal_id'] = data.deal_id
  if (data.due_date !== undefined) out['date'] = data.due_date
  if (data.done !== undefined) out['done'] = data.done
  return out
}
