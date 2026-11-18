/**
 * Transform between Megaplan API v3 Task entities and canonical Activity.
 *
 * Megaplan tasks (ru: Задачи) are the closest equivalent to activities.
 * v3 API fields:
 *   id, contentType, name, statement (body), status, priority,
 *   responsible, author, owner (for deal/contact links),
 *   deadlineHard (due date), timeCreated, timeUpdated
 *
 * Megaplan task statuses: "open", "inwork", "done", "cancelled", "paused"
 */

import type { Activity } from '../../../schema/activity'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawMegaplanActivity {
  id?: string | number
  contentType?: string
  name?: string
  /** Task body / description */
  statement?: string
  /** Task status: "open" | "inwork" | "done" | "cancelled" | "paused" */
  status?: string
  /** Responsible employee */
  responsible?: { id?: string | number; contentType?: string }
  /** Author of the task */
  author?: { id?: string | number; contentType?: string }
  /** Hard deadline ISO-8601 string */
  deadlineHard?: string
  /** Linked deal (if any) */
  deal?: { id?: string | number; contentType?: string }
  /** Linked contractor (contact/company) */
  contractor?: { id?: string | number; contentType?: string }
  timeCreated?: string | number
  timeUpdated?: string | number
  [key: string]: unknown
}

export function transformActivity(raw: RawMegaplanActivity): Activity {
  const responsibleId = raw.responsible?.id != null ? String(raw.responsible.id) : undefined
  const dealId = raw.deal?.id != null ? String(raw.deal.id) : undefined
  const contractorId = raw.contractor?.id != null ? String(raw.contractor.id) : undefined

  const isDone =
    typeof raw.status === 'string' && raw.status.toLowerCase() === 'done'

  return {
    id: String(raw.id ?? ''),
    type: 'task',
    subject: raw.name ?? undefined,
    note: raw.statement ?? undefined,
    owner_id: responsibleId,
    contact_id: contractorId,
    deal_id: dealId,
    done: isDone,
    due_date: toIsoDatetime(raw.deadlineHard),
    created_at: toIsoDatetime(raw.timeCreated),
    updated_at: toIsoDatetime(raw.timeUpdated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out['name'] = data.subject
  if (data.note !== undefined) out['statement'] = data.note
  if (data.owner_id !== undefined) out['responsible'] = { id: data.owner_id }
  if (data.due_date !== undefined) out['deadlineHard'] = data.due_date
  if (data.done !== undefined) out['status'] = data.done ? 'done' : 'open'
  if (data.deal_id !== undefined) out['deal'] = { id: data.deal_id }
  if (data.contact_id !== undefined) out['contractor'] = { id: data.contact_id }
  return out
}
