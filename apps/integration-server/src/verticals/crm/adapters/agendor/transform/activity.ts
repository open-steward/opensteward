import type { Activity } from '../../../schema/activity'

export interface RawAgendorActivity {
  id: number | string
  type?: string
  title?: string
  due_date?: string
  done?: boolean
  person?: { id: number | string } | null
  deal?: { id: number | string } | null
  created_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawAgendorActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.title,
    due_date: raw.due_date,
    done: raw.done,
    contact_id: raw.person?.id != null ? String(raw.person.id) : undefined,
    deal_id: raw.deal?.id != null ? String(raw.deal.id) : undefined,
    created_at: raw.created_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.title = data.subject
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.done = data.done
  if (data.contact_id !== undefined) out.person_id = Number(data.contact_id)
  if (data.deal_id !== undefined) out.deal_id = Number(data.deal_id)
  return out
}
