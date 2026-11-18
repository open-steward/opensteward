/**
 * Activity transform for the Vendasta CRM External API (/org) list shape.
 *
 * ListCrmRecords (POST /list/{namespace}/activities) returns
 * `objects[]: { id, fields[]: { id, value } }`, where `value` is one of
 * string | boolean | integer | number | Timestamp {seconds, nanos} | string[].
 * Field ids come from the documented CRM Activity field schema
 * (components.schemas.CRMActivity):
 *   system__activity_activity_type    "Type of activity"
 *   standard__activity_name           "Display name used when showing a summary of the activity."
 *   standard__activity_task_due_date  "Optional date indicating when the task is due for completion" (date-time)
 *   standard__activity_task_status    "Status for a given task, e.g.: COMPLETED, NOT_STARTED, IN_PROGRESS, etc…"
 *   system__activity_owner_id         "Owner of the record."
 *   system__activity_created          "When the record was created" (date)
 *   system__activity_updated          "When the record was last updated" (date)
 * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/crm/crm.json
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/** Documented `Timestamp` value shape: `{ seconds, nanos }`. */
export interface VendastaOrgTimestamp {
  seconds?: number
  nanos?: number
}

export interface VendastaOrgFieldValue {
  id?: string
  value?: string | boolean | number | VendastaOrgTimestamp | string[]
}

export interface RawVendastaOrgActivity {
  id?: string
  fields?: VendastaOrgFieldValue[]
}

function value(raw: RawVendastaOrgActivity, fieldId: string): VendastaOrgFieldValue['value'] {
  return raw.fields?.find((f) => f.id === fieldId)?.value
}

function str(raw: RawVendastaOrgActivity, fieldId: string): string | undefined {
  const v = value(raw, fieldId)
  return typeof v === 'string' && v !== '' ? v : undefined
}

function iso(raw: RawVendastaOrgActivity, fieldId: string): string | undefined {
  const v = value(raw, fieldId)
  if (typeof v === 'string') return toIsoDatetime(v)
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.seconds === 'number') {
    return new Date(v.seconds * 1000 + Math.floor((v.nanos ?? 0) / 1e6)).toISOString()
  }
  return undefined
}

export function transformOrgActivity(raw: RawVendastaOrgActivity): Activity {
  if (!raw.id) throw new Error('Vendasta activity record has no id')
  const status = str(raw, 'standard__activity_task_status')
  return {
    id: raw.id,
    type: str(raw, 'system__activity_activity_type'),
    subject: str(raw, 'standard__activity_name'),
    owner_id: str(raw, 'system__activity_owner_id'),
    due_date: iso(raw, 'standard__activity_task_due_date'),
    done: status === undefined ? undefined : status === 'COMPLETED',
    created_at: iso(raw, 'system__activity_created'),
    updated_at: iso(raw, 'system__activity_updated'),
    metadata: raw as Record<string, unknown>,
  }
}
