import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'
import { refId, requireId, text, type ValueRef } from '../refs'

/**
 * ForceManager Activity, as documented by GET /activities and GET /activities/{ID}
 * (https://developer.forcemanager.com/openapi.json, "List of the supported
 * Activities attributes"). Only the attributes this transform reads are typed.
 */
export interface RawForceManagerActivity {
  id?: number | string | null
  typeId?: ValueRef | null
  comment?: string | null
  date?: string | null
  accountId?: ValueRef | null
  contactId?: ValueRef | null
  opportunityId?: ValueRef | null
  salesRepId?: ValueRef | null
  dateCreated?: string | null
  dateUpdated?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawForceManagerActivity): Activity {
  return {
    id: requireId(raw, 'activity'),
    // typeId is the Activity Type value-list entry, e.g. { "id": 6418, "value": "Visit" }.
    type: text(raw.typeId?.value),
    note: text(raw.comment),
    // "date | String | Date referred to the moment in which the Activity took place"
    due_date: toIsoDatetime(raw.date),
    contact_id: refId(raw.contactId),
    company_id: refId(raw.accountId),
    deal_id: refId(raw.opportunityId),
    owner_id: refId(raw.salesRepId),
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateUpdated),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.comment = data.note
  if (data.type !== undefined) out.type = data.type
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  return out
}
