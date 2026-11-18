/**
 * Activity transform: Vendasta CRM Activity <-> OpenSteward canonical Activity.
 *
 * Vendasta activity types are modelled as CRM objects with a `system__activity_activity_type`
 * field. We map task activities here (the most broadly-used type for programmatic access).
 *
 * Relevant Vendasta field IDs:
 *   system__activity_id             — unique activity ID (read-only)
 *   system__activity_activity_type  — e.g. "task", "call", "email", "meeting", "note"
 *   standard__activity_name         — activity subject / title
 *   standard__activity_task_body    — task body / description
 *   standard__activity_task_due_date — ISO due date
 *   standard__activity_task_status  — "pending" | "completed" | "cancelled"
 *   standard__activity_task_type    — optional task sub-type
 *   system__activity_owner_id       — owner user ID
 *   system__activity_created        — ISO datetime (read-only)
 *   system__activity_updated        — ISO datetime (read-only)
 */

import type { Activity } from '../../../schema/activity'
import {
  type VendastaCrmObject,
  type VendastaFieldValue,
  getField,
  strField,
} from '../client'

export type RawVendastaActivity = VendastaCrmObject

export function transformActivity(raw: RawVendastaActivity): Activity {
  const f = raw.fields ?? []
  const id = raw.crmObjectId ?? getField(f, 'system__activity_id') ?? ''

  const activityType = getField(f, 'system__activity_activity_type') ?? 'task'
  const status = getField(f, 'standard__activity_task_status')
  const done = status === 'completed' || status === 'COMPLETED'

  return {
    id: String(id),
    type:     activityType,
    subject:  getField(f, 'standard__activity_name'),
    note:     getField(f, 'standard__activity_task_body'),
    owner_id: raw.ownerId ?? getField(f, 'system__activity_owner_id'),
    due_date: getField(f, 'standard__activity_task_due_date'),
    done,
    created_at: raw.created,
    updated_at: raw.updated,
    metadata:   raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): VendastaFieldValue[] {
  const fields: VendastaFieldValue[] = []
  const push = (fv: VendastaFieldValue | null) => { if (fv) fields.push(fv) }

  push(strField('standard__activity_name',         data.subject ?? undefined))
  push(strField('standard__activity_task_body',    data.note ?? undefined))
  push(strField('standard__activity_task_due_date', data.due_date ?? undefined))
  push(strField('system__activity_activity_type',   data.type ?? undefined))

  if (data.done !== undefined) {
    push(strField('standard__activity_task_status', data.done ? 'completed' : 'pending'))
  }

  return fields
}
