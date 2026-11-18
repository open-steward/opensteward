import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * One Calendar (task) or Events (call, meeting) record from the webservice.
 *
 * Field names are the webservice names vtiger's installer gives both modules
 * (code.vtiger.com, modules/Users/DefaultDataPopulator.php, the vtiger_field
 * rows for tabid 9 'Calendar' and 16 'Events'): subject, assigned_user_id,
 * date_start, time_start, due_date, time_end, parent_id, contact_id,
 * taskstatus (Calendar), eventstatus, activitytype, description, createdtime,
 * modifiedtime.
 *
 * Datetimes carry no offset ("createdtime": "2023-06-13 05:46:59" in the vtap
 * examples). vtiger stores them in the server's PHP default timezone, which
 * its config.template.php ships as `$default_timezone = 'UTC';`, so they are
 * read as UTC.
 */
export interface RawVtigerActivity {
  id: string
  subject?: string
  description?: string
  date_start?: string
  time_start?: string
  activitytype?: string
  assigned_user_id?: string
  contact_id?: string
  createdtime?: string
  modifiedtime?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawVtigerActivity): Activity {
  // A date with no time of day would need an invented time: leave it out.
  const dueDate =
    raw.date_start && raw.time_start
      ? toIsoDatetime(`${raw.date_start}T${raw.time_start}`)
      : undefined
  return {
    id: String(raw.id),
    type: raw.activitytype || undefined,
    subject: raw.subject || undefined,
    note: raw.description || undefined,
    due_date: dueDate,
    owner_id: raw.assigned_user_id ? String(raw.assigned_user_id) : undefined,
    contact_id: raw.contact_id ? String(raw.contact_id) : undefined,
    created_at: toIsoDatetime(raw.createdtime),
    updated_at: toIsoDatetime(raw.modifiedtime),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.activitytype = data.type
  if (data.due_date !== undefined) {
    const [date, time] = data.due_date.split('T')
    out.date_start = date
    if (time) out.time_start = time
  }
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  if (data.contact_id !== undefined) out.contactid = data.contact_id
  return out
}
