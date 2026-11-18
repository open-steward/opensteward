import type { Activity } from '../../../schema/activity'

export interface RawRdStationActivity {
  _id: string
  type?: string
  subject?: string
  body?: string
  contact_id?: string | null
  deal_id?: string | null
  user?: { _id: string } | null
  date?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawRdStationActivity): Activity {
  return {
    id: raw._id,
    type: raw.type,
    subject: raw.subject,
    note: raw.body,
    contact_id: raw.contact_id ?? undefined,
    deal_id: raw.deal_id ?? undefined,
    owner_id: raw.user?._id ?? undefined,
    due_date: raw.date ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.body = data.note
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  if (data.owner_id !== undefined) out.user = { _id: data.owner_id }
  if (data.due_date !== undefined) out.date = data.due_date
  return out
}
