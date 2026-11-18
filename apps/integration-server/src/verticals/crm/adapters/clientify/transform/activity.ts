import type { Activity } from '../../../schema/activity'
import { idFromUrl } from '../url-id'

/**
 * One task as GET /v1/tasks/ and GET /v1/tasks/:task_id/ return it
 * (https://developer.clientify.com/, "List Tasks", "Task Details"). Related
 * records are hyperlinks; `owner` and `assigned_to` are e-mails, not ids.
 */
export interface RawClientifyActivity {
  url?: string
  id: number
  owner?: string | null
  owner_name?: string | null
  assigned_to?: string | null
  assigned_to_name?: string | null
  name?: string | null
  description?: string | null
  remarks?: string | null
  due_date?: string | null
  type?: number | null
  status?: number | null
  status_desc?: string | null
  deals?: string[] | null
  task_type?: string | null
  type_desc?: string | null
  task_stage?: string | null
  related_companies?: string[] | null
  related_contacts?: string[] | null
  [key: string]: unknown
}

/** "You can also filter the tasks by status_id using this values: ... 5: COMPLETED_STATUS" (List Tasks). */
const COMPLETED_STATUS = 5

export function transformActivity(raw: RawClientifyActivity): Activity {
  return {
    id: String(raw.id),
    // Every row comes from the tasks endpoint.
    type: 'task',
    subject: raw.name || undefined,
    note: raw.description || undefined,
    due_date: raw.due_date ?? undefined,
    done: raw.status != null ? raw.status === COMPLETED_STATUS : undefined,
    contact_id: idFromUrl(raw.related_contacts?.[0]),
    company_id: idFromUrl(raw.related_companies?.[0]),
    deal_id: idFromUrl(raw.deals?.[0]),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) out.contact = data.contact_id
  if (data.company_id !== undefined) out.company = data.company_id
  if (data.deal_id !== undefined) out.deal = data.deal_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
