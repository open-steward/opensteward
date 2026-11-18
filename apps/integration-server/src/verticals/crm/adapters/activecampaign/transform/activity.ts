import type { Activity } from '../../../schema/activity'

export interface RawActiveCampaignTask {
  id: string | number
  title?: string
  note?: string
  duedate?: string | null
  deal_id?: string | number | null
  owner?: string | number | null
  cdate?: string
  udate?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawActiveCampaignTask): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.title ?? undefined,
    note: raw.note ?? undefined,
    deal_id: raw.deal_id != null && raw.deal_id !== '' ? String(raw.deal_id) : undefined,
    owner_id: raw.owner != null && raw.owner !== '' ? String(raw.owner) : undefined,
    due_date: raw.duedate ?? undefined,
    created_at: raw.cdate ?? undefined,
    updated_at: raw.udate ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.due_date !== undefined) out.duedate = data.due_date
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
