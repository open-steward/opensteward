/**
 * Vincere activities → canonical Activity.
 *
 * Field names come from Vincere's OpenAPI spec, https://api.vincere.io/vapi.yaml:
 * the `content` items of POST /activities ("Search activities") and the body
 * of GET /activities/{id} ("Get details of activity."), which share
 * `id` "ID of the activity: Comment, Task or Meeting.", `category` "Category
 * of Activity." (COMMENT, TASK, MEETING, APPLICATION, EMAIL_SENT, ...),
 * `entity_type` "Entity type." (CANDIDATE, COMPANY, CONTACT, JOB, DEAL,
 * JOB_LEAD), `entity_id`, `subject`, `created_by_id` "ID of an user in
 * Vincere" and `created_date`. The detail adds `content` "Content or the
 * description of a comment." and `due_date`.
 *
 * The linked record maps by `entity_type` onto this adapter's canonical ids:
 * CANDIDATE → contact_id (canonical Contacts are candidates), COMPANY →
 * company_id, JOB → deal_id (canonical Deals are jobs). A Vincere CONTACT,
 * DEAL or JOB_LEAD has no canonical counterpart here and stays in metadata.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawVincereActivity {
  id: number
  category?: string | null
  entity_type?: string | null
  entity_id?: number | null
  subject?: string | null
  created_by_id?: number | null
  created_date?: string | null
  /** Detail only. */
  content?: string | null
  /** Detail only. */
  due_date?: string | null
  [key: string]: unknown
}

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

export function transformActivity(raw: RawVincereActivity): Activity {
  if (typeof raw.id !== 'number' && typeof raw.id !== 'string') {
    throw new Error('Vincere activity without an id')
  }
  const linked = raw.entity_id != null ? String(raw.entity_id) : undefined
  return {
    id: String(raw.id),
    type: text(raw.category)?.toLowerCase(),
    subject: text(raw.subject),
    note: text(raw.content),
    contact_id: raw.entity_type === 'CANDIDATE' ? linked : undefined,
    company_id: raw.entity_type === 'COMPANY' ? linked : undefined,
    deal_id: raw.entity_type === 'JOB' ? linked : undefined,
    owner_id: raw.created_by_id != null ? String(raw.created_by_id) : undefined,
    due_date: toIsoDatetime(raw.due_date),
    created_at: toIsoDatetime(raw.created_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.type !== undefined) body.activity_type = data.type
  if (data.subject !== undefined) body.subject = data.subject
  if (data.note !== undefined) body.description = data.note
  if (data.due_date !== undefined) body.due_date = data.due_date
  if (data.done !== undefined) body.completed = data.done
  if (data.owner_id !== undefined) body.owner_id = data.owner_id
  if (data.contact_id !== undefined) body.candidate_id = data.contact_id
  if (data.company_id !== undefined) body.company_id = data.company_id
  if (data.deal_id !== undefined) body.job_id = data.deal_id
  return body
}
