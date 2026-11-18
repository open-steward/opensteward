import type { Activity } from '../../../schema/activity'

export interface RawCapsuleActivity {
  id: number | string
  description?: string
  detail?: string
  dueOn?: string
  completedOn?: string | null
  category?: { name?: string } | null
  party?: { id: number | string } | null
  opportunity?: { id: number | string } | null
  owner?: { id: number | string } | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawCapsuleActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.category?.name,
    subject: raw.description,
    note: raw.detail,
    contact_id: raw.party?.id != null ? String(raw.party.id) : undefined,
    deal_id: raw.opportunity?.id != null ? String(raw.opportunity.id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    due_date: raw.dueOn,
    done: raw.completedOn != null,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.description = data.subject
  if (data.note !== undefined) out.detail = data.note
  if (data.type !== undefined) out.category = { name: data.type }
  if (data.contact_id !== undefined) out.party = { id: Number(data.contact_id) }
  if (data.deal_id !== undefined) out.opportunity = { id: Number(data.deal_id) }
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  if (data.due_date !== undefined) out.dueOn = data.due_date
  if (data.done !== undefined && data.done) {
    out.completedOn = new Date().toISOString().split('T')[0]
  }
  return out
}
