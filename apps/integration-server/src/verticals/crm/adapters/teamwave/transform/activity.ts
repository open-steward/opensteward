import type { Activity } from '../../../schema/activity'

export interface RawTeamwaveActivity {
  id: number
  type?: string
  subject?: string
  description?: string
  contact_id?: number | null
  organization_id?: number | null
  deal_id?: number | null
  owner_id?: number | null
  due_date?: string | null
  done?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawTeamwaveActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    note: raw.description,
    contact_id: raw.contact_id != null ? String(raw.contact_id) : undefined,
    company_id: raw.organization_id != null ? String(raw.organization_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: raw.due_date ?? undefined,
    done: raw.done ?? false,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.contact_id !== undefined) out.contact_id = Number(data.contact_id)
  if (data.company_id !== undefined) out.organization_id = Number(data.company_id)
  if (data.deal_id !== undefined) out.deal_id = Number(data.deal_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.done = data.done
  return out
}
