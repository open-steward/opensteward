import type { Activity } from '../../../schema/activity'
import { iso, ref, requireId, text } from '../fields'

/**
 * A task as GET /qontak/crm/tasks and GET /qontak/crm/tasks/{id} return it.
 * Qontak's CRM API has no activities resource; tasks are its scheduled
 * activities ("Manage leads, companies, deals, and tasks"). Only the fields
 * this transform reads are typed; every key is from the documented 200
 * example in Qontak's CRM OpenAPI
 * (https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json).
 */
export interface RawQontakActivity {
  id: number | string
  name?: string | null
  detail?: string | null
  crm_person_id?: number | string | null
  crm_company_id?: number | string | null
  crm_deal_id?: number | string | null
  user_id?: number | string | null
  due_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawQontakActivity): Activity {
  return {
    id: requireId(raw.id, 'task'),
    type: 'task',
    subject: text(raw.name),
    note: text(raw.detail),
    contact_id: ref(raw.crm_person_id),
    company_id: ref(raw.crm_company_id),
    deal_id: ref(raw.crm_deal_id),
    owner_id: ref(raw.user_id),
    due_date: iso(raw.due_date),
    created_at: iso(raw.created_at),
    updated_at: iso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.is_done = data.done
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.organization_id = data.company_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
