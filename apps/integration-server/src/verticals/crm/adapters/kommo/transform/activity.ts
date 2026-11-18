import type { Activity } from '../../../schema/activity'

export interface RawKommoTask {
  id: number
  text?: string
  task_type_id?: number
  complete_till?: number
  entity_id?: number
  entity_type?: string
  responsible_user_id?: number
  is_completed?: boolean
  created_at?: number
  updated_at?: number
  [key: string]: unknown
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null || ts === 0) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformActivity(raw: RawKommoTask): Activity {
  const isContact = raw.entity_type === 'contacts'
  const isLead = raw.entity_type === 'leads'

  return {
    id: String(raw.id),
    type: raw.task_type_id != null ? String(raw.task_type_id) : undefined,
    subject: raw.text,
    note: raw.text,
    contact_id: isContact && raw.entity_id != null ? String(raw.entity_id) : undefined,
    deal_id: isLead && raw.entity_id != null ? String(raw.entity_id) : undefined,
    owner_id: raw.responsible_user_id != null ? String(raw.responsible_user_id) : undefined,
    due_date: unixToIso(raw.complete_till),
    done: raw.is_completed ?? false,
    created_at: unixToIso(raw.created_at),
    updated_at: unixToIso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.text = data.subject
  else if (data.note !== undefined) out.text = data.note
  if (data.type !== undefined) out.task_type_id = Number(data.type) || 1
  if (data.due_date !== undefined) {
    out.complete_till = Math.floor(new Date(data.due_date).getTime() / 1000)
  }
  if (data.owner_id !== undefined) out.responsible_user_id = Number(data.owner_id)
  if (data.contact_id !== undefined) {
    out.entity_id = Number(data.contact_id)
    out.entity_type = 'contacts'
  } else if (data.deal_id !== undefined) {
    out.entity_id = Number(data.deal_id)
    out.entity_type = 'leads'
  }
  if (data.done !== undefined) out.is_completed = data.done
  return out
}
