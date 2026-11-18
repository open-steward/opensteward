import type { Activity } from '../../../schema/activity'
import { refId, str, wallTimeToIso } from '../dates'

/**
 * A Calendar record's raw data (`x-raw-data: 1`), keyed by field name.
 *
 * Field names are the `fieldname` column of YetiForce's install schema for
 * the Calendar module (tabid 9), install/install_schema/data.sql in
 * github.com/YetiForceCompany/YetiForceCRM: subject, activitytype,
 * description, activitystatus, assigned_user_id, due_date ("Due Date &
 * Time", with time_end), createdtime, modifiedtime. activitystatus values
 * are PLL_PLANNED, PLL_IN_REALIZATION, PLL_OVERDUE, PLL_POSTPONED,
 * PLL_CANCELLED and PLL_COMPLETED (vtiger_activitystatus).
 *
 * `link` and `process` are not mapped: they may reference several modules,
 * so the raw id alone does not say whether it is a contact, company or deal.
 */
export type RawYetiForceActivity = Record<string, unknown>

/** Fields the Calendar list asks for with `x-fields`. */
export const ACTIVITY_FIELDS = [
  'subject',
  'activitytype',
  'description',
  'activitystatus',
  'assigned_user_id',
  'due_date',
  'time_end',
  'createdtime',
  'modifiedtime',
] as const

function dueAt(raw: RawYetiForceActivity, rawTimeZone: string): string | undefined {
  const date = str(raw['due_date'])
  const time = str(raw['time_end'])
  return date && time ? wallTimeToIso(`${date} ${time}`, rawTimeZone) : undefined
}

export function transformActivity(
  id: string,
  raw: RawYetiForceActivity,
  rawTimeZone: string,
): Activity {
  const status = str(raw['activitystatus'])
  return {
    id,
    type: str(raw['activitytype']),
    subject: str(raw['subject']),
    note: str(raw['description']),
    owner_id: refId(raw['assigned_user_id']),
    due_date: dueAt(raw, rawTimeZone),
    done: status !== undefined ? status === 'PLL_COMPLETED' : undefined,
    created_at: wallTimeToIso(raw['createdtime'], rawTimeZone),
    updated_at: wallTimeToIso(raw['modifiedtime'], rawTimeZone),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out['activitytype'] = data.type
  if (data.subject !== undefined) out['subject'] = data.subject
  if (data.note !== undefined) out['description'] = data.note
  if (data.contact_id !== undefined) out['contact_id'] = data.contact_id
  if (data.due_date !== undefined) out['due_date'] = data.due_date
  if (data.done !== undefined) out['status'] = data.done ? 'Completed' : 'Not Started'
  return out
}
