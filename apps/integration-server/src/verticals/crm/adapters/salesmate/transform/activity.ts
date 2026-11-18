import type { Activity } from '../../../schema/activity'
import { isoDate, refId, requireId, text, type SalesmateRef } from '../fields'

/**
 * A Salesmate v4 activity. "Get an activity" (`GET /apis/activity/v4/{id}`)
 * publishes no example body, so the fields are the ones the docs name for
 * this module (Add an activity): "title required String", "type optional
 * String … such as call, meeting etc.", "description optional String",
 * "isCompleted optional Boolean", "relatedTo optional Integer Deal of the
 * activity"; and from the Search an activity body `activity.owner.id`,
 * `activity.primaryContact.id`, `activity.primaryCompany.id`,
 * `activity.relatedTo.id`, `activity.createdAt` and `activity.lastModifiedAt`.
 *
 * `dueDate` ("Integer Expiry date of an activity") and `duration` ("Integer
 * Time duration of an activity") document no unit, so they stay in
 * `metadata` rather than being guessed into `due_date` / `duration_minutes`.
 */
export interface RawSalesmateActivity {
  id?: number | string
  title?: string
  type?: string
  description?: string
  isCompleted?: boolean
  primaryContact?: SalesmateRef | null
  primaryCompany?: SalesmateRef | null
  relatedTo?: SalesmateRef | null
  owner?: SalesmateRef | null
  createdAt?: string
  lastModifiedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawSalesmateActivity): Activity {
  return {
    id: requireId(raw.id, 'activity'),
    type: text(raw.type),
    subject: text(raw.title),
    note: text(raw.description),
    done: typeof raw.isCompleted === 'boolean' ? raw.isCompleted : undefined,
    contact_id: refId(raw.primaryContact),
    company_id: refId(raw.primaryCompany),
    deal_id: refId(raw.relatedTo),
    owner_id: refId(raw.owner),
    created_at: isoDate(raw.createdAt),
    updated_at: isoDate(raw.lastModifiedAt),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.type = data.type
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.isCompleted = data.done
  if (data.contact_id !== undefined) out.contact = data.contact_id
  if (data.company_id !== undefined) out.company = data.company_id
  if (data.deal_id !== undefined) out.deal = data.deal_id
  return out
}
