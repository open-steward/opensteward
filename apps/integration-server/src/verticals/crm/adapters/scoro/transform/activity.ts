import type { Activity } from '../../../schema/activity'
import { idOf, isoWithOffset, nonEmpty, requiredId } from '../fields'

/**
 * A Scoro task. Fields from the Tasks table at https://api.scoro.com/api/v2:
 *
 *   event_id      Integer   "Event ID"
 *   event_name    String    "Event name."
 *   description   String    "Event description."
 *   is_completed  Boolean   "Is completed." ("Booleans are either 1 (true) or 0 (false).")
 *   datetime_due  Datetime (DATE_ISO8601 - Y-m-d\TH:i:sP) "Tasks due date."
 *   company_id    Integer   "Related company ID."
 *   person_id     Integer   "Related person ID."
 *   quote_id      Integer   "Related quote ID."
 *   owner_id      Integer   "User ID of the user that is responsible for the event."
 *   created_date  Datetime  "Created date. Cannot be modified through API."
 *   modified_date Datetime  "The date when event was last modified."
 *
 * Every row comes from the tasks module, so its type is 'task'. Deals are
 * quotes in this adapter, so quote_id is the deal link.
 */
export interface RawScoroActivity {
  event_id?: number | string
  event_name?: string | null
  description?: string | null
  is_completed?: boolean | number | string | null
  datetime_due?: string | null
  company_id?: number | string | null
  person_id?: number | string | null
  quote_id?: number | string | null
  owner_id?: number | string | null
  created_date?: string | null
  modified_date?: string | null
  [key: string]: unknown
}

function completed(value: RawScoroActivity['is_completed']): boolean | undefined {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  return undefined
}

export function transformActivity(raw: RawScoroActivity): Activity {
  return {
    id: requiredId(raw.event_id, 'task'),
    type: 'task',
    subject: nonEmpty(raw.event_name),
    note: nonEmpty(raw.description),
    due_date: isoWithOffset(raw.datetime_due),
    done: completed(raw.is_completed),
    contact_id: idOf(raw.person_id),
    company_id: idOf(raw.company_id),
    deal_id: idOf(raw.quote_id),
    owner_id: idOf(raw.owner_id),
    created_at: isoWithOffset(raw.created_date),
    updated_at: isoWithOffset(raw.modified_date),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.type = data.type
  if (data.due_date !== undefined) out.datetime_start = data.due_date
  if (data.done !== undefined) out.is_completed = data.done
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.project_id = data.deal_id
  return out
}
