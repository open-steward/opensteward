import type { Activity } from '../../../schema/activity'

export interface RawZendeskSellTask {
  id: number
  content?: string
  due_date?: string | null
  resource_type?: string
  resource_id?: number | null
  owner_id?: number | null
  completed?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawZendeskSellTask): Activity {
  const isContact = raw.resource_type === 'contact'
  const isDeal = raw.resource_type === 'deal'
  return {
    id: String(raw.id),
    subject: raw.content,
    note: raw.content,
    contact_id: isContact && raw.resource_id != null ? String(raw.resource_id) : undefined,
    deal_id: isDeal && raw.resource_id != null ? String(raw.resource_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: raw.due_date ?? undefined,
    done: raw.completed,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.content = data.subject
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) {
    out.resource_type = 'contact'
    out.resource_id = Number(data.contact_id)
  } else if (data.deal_id !== undefined) {
    out.resource_type = 'deal'
    out.resource_id = Number(data.deal_id)
  }
  return out
}
