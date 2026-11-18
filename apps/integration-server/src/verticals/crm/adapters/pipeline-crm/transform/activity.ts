import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawPipelineCrmActivity {
  id: string | number
  type?: string
  name?: string
  note?: string
  person_id?: string | number
  company_id?: string | number
  deal_id?: string | number
  owner_id?: string | number
  due_date?: string
  completed?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawPipelineCrmActivity): Activity {
  return {
    id: String(raw.id),
    type: typeof raw.type === 'string' ? raw.type.toLowerCase() : raw.type != null ? String(raw.type).toLowerCase() : undefined,
    subject: raw.name,
    note: raw.note,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: toIsoDatetime(raw.due_date),
    done: typeof raw.completed === 'boolean' ? raw.completed : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.type !== undefined) out.type = data.type
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.completed = data.done
  return out
}
