import type { Activity } from '../../../schema/activity'

export interface RawBiginActivity {
  id: string
  Activity_Type?: string
  Subject?: string
  Due_Date?: string | null
  Status?: string
  Who_Id?: { id: string } | null
  What_Id?: { id: string } | null
  Owner?: { id: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawBiginActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.Activity_Type ?? undefined,
    subject: raw.Subject ?? undefined,
    due_date: raw.Due_Date ?? undefined,
    done: raw.Status === 'Completed',
    contact_id: raw.Who_Id?.id != null ? String(raw.Who_Id.id) : undefined,
    deal_id: raw.What_Id?.id != null ? String(raw.What_Id.id) : undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.Activity_Type = data.type
  if (data.subject !== undefined) out.Subject = data.subject
  if (data.due_date !== undefined) out.Due_Date = data.due_date
  if (data.done !== undefined) out.Status = data.done ? 'Completed' : 'Not Started'
  if (data.contact_id !== undefined) out.Who_Id = { id: data.contact_id }
  if (data.deal_id !== undefined) out.What_Id = { id: data.deal_id }
  return out
}
