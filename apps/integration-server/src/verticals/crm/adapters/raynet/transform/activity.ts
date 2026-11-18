import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * A task as GET /task/ ("list of tasks") and GET /task/{taskId}/
 * ("task detail") return it. Only fields the documented 200 examples carry.
 */
export interface RawRaynetActivity {
  id: number
  title?: string | null
  /** "[Task description]" (HTML in the documented example). */
  description?: string | null
  status?: string | null
  owner?: { id?: number; fullName?: string } | null
  company?: { id?: number; name?: string } | null
  person?: { id?: number } | null
  businessCase?: { id?: number } | null
  /** "[Scheduled in calendar from]". */
  scheduledFrom?: string | null
  /** "[Scheduled in calendar to]". */
  scheduledTill?: string | null
  /** "[Deadline]". */
  deadline?: string | null
  /** "[Date of completion]"; null while the task is open. */
  completed?: string | null
  'rowInfo.createdAt'?: string | null
  'rowInfo.updatedAt'?: string | null
  [key: string]: unknown
}

function idOf(ref: { id?: number } | null | undefined): string | undefined {
  return ref?.id != null ? String(ref.id) : undefined
}

export function transformActivity(raw: RawRaynetActivity): Activity {
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.title ?? undefined,
    note: raw.description ?? undefined,
    contact_id: idOf(raw.person),
    company_id: idOf(raw.company),
    deal_id: idOf(raw.businessCase),
    owner_id: idOf(raw.owner),
    due_date: toIsoDatetime(raw.deadline),
    done: raw.completed != null,
    created_at: toIsoDatetime(raw['rowInfo.createdAt']),
    updated_at: toIsoDatetime(raw['rowInfo.updatedAt']),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.contact = { id: Number(data.contact_id) }
  if (data.company_id !== undefined) out.account = { id: Number(data.company_id) }
  if (data.deal_id !== undefined) out.businessCase = { id: Number(data.deal_id) }
  if (data.due_date !== undefined) out.scheduledFrom = data.due_date
  if (data.done !== undefined) out.completed = data.done
  return out
}
