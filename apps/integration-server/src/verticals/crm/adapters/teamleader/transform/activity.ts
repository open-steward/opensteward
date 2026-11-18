import type { Activity } from '../../../schema/activity'

export interface RawTeamleaderActivity {
  id: string
  subject?: string
  description?: string
  starts_on?: string
  ends_on?: string
  done?: boolean
  [key: string]: unknown
}

export function transformActivity(raw: RawTeamleaderActivity): Activity {
  return {
    id: raw.id,
    subject: raw.subject,
    note: raw.description,
    due_date: raw.ends_on ?? raw.starts_on,
    done: raw.done,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.ends_on = data.due_date
  if (data.done !== undefined) out.done = data.done
  return out
}
