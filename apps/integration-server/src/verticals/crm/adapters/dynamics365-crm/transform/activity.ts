import type { Activity } from '../../../schema/activity'

export interface RawDynamicsTask {
  activityid: string
  subject?: string | null
  description?: string | null
  scheduledend?: string | null
  statecode?: number | null
  _ownerid_value?: string | null
  _regardingobjectid_value?: string | null
  createdon?: string | null
  modifiedon?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawDynamicsTask): Activity {
  return {
    id: String(raw.activityid),
    subject: raw.subject ?? undefined,
    note: raw.description ?? undefined,
    due_date: raw.scheduledend ?? undefined,
    done: raw.statecode === 1,  // statecode 1 = Completed in D365
    owner_id: raw._ownerid_value ?? undefined,
    contact_id: raw._regardingobjectid_value ?? undefined,
    created_at: raw.createdon ?? undefined,
    updated_at: raw.modifiedon ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.scheduledend = data.due_date
  if (data.done !== undefined) out.statecode = data.done ? 1 : 0
  if (data.owner_id !== undefined) {
    out['ownerid@odata.bind'] = `/systemusers(${data.owner_id})`
  }
  return out
}
