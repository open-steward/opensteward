import type { Activity } from '../../../schema/activity'

export interface RawSellsyActivity {
  id: number | string
  name?: string
  description?: string
  deadline?: string | null
  is_done?: boolean
  owner_id?: number | string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawSellsyActivity): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.name,
    note: raw.description,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: raw.deadline ?? undefined,
    done: raw.is_done,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.due_date !== undefined) out.deadline = data.due_date
  if (data.done !== undefined) out.is_done = data.done
  return out
}
