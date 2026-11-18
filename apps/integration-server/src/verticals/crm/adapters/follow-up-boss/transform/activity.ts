/**
 * Follow Up Boss task ↔ canonical Activity transform.
 *
 * FUB task wire shape (GET /v1/tasks, GET /v1/tasks/:id):
 *   id            number
 *   name          string   — task name / subject
 *   type          string   — task type
 *   note          string   — task description / body
 *   personId      number   — linked contact id
 *   dealId        number   — linked deal id
 *   assignedTo    string   — agent email
 *   assignedUserId number
 *   dueDate       string   — ISO 8601
 *   isCompleted   boolean
 *   created       string   — ISO 8601
 *   updated       string   — ISO 8601
 */
import type { Activity } from '../../../schema/activity'

export interface RawFollowUpBossTask {
  id?: number | string
  name?: string
  type?: string
  note?: string
  personId?: number | string
  dealId?: number | string
  assignedTo?: string
  assignedUserId?: number | string
  dueDate?: string
  isCompleted?: boolean
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawFollowUpBossTask): Activity {
  return {
    id: String(raw.id ?? ''),
    type: raw.type ?? undefined,
    subject: raw.name ?? undefined,
    note: raw.note ?? undefined,
    contact_id: raw.personId != null ? String(raw.personId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id:
      raw.assignedTo ??
      (raw.assignedUserId != null ? String(raw.assignedUserId) : undefined),
    due_date: raw.dueDate ?? undefined,
    done: raw.isCompleted ?? undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(
  data: Partial<Activity>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.type !== undefined) out.type = data.type
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.personId = data.contact_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.owner_id !== undefined) out.assignedTo = data.owner_id
  if (data.done !== undefined) out.isCompleted = data.done
  return out
}
