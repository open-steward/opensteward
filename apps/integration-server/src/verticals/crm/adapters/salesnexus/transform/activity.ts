/**
 * SalesNexus activity transforms.
 *
 * SalesNexus activities are identified by an `activity-id` string.
 * Fields are flat properties on the activity object (not in a field-values map).
 * Activity types: call | meeting | todo
 *
 * Transforms NEVER throw — missing optional fields return undefined.
 */
import type { Activity } from '../../../schema/activity'

/** Raw SalesNexus activity as returned by get-activities / get-activity-info. */
export interface RawSalesnexusActivity {
  'activity-id': string
  /** Subject / title of the activity. */
  regarding?: string
  /** Free-form notes / description. */
  details?: string
  /** Contact ID this activity is scheduled with. */
  'schedule-with'?: string
  /** User ID this activity is assigned to. */
  'schedule-for'?: string
  /** Activity type: call | meeting | todo */
  type?: string
  /** ISO-8601-compatible start time. */
  'start-time'?: string
  /** ISO-8601-compatible end time. */
  'end-time'?: string
  /** Whether the activity was completed. */
  completed?: boolean | string
  /** Display color. */
  color?: string
  [key: string]: unknown
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

export function transformActivity(raw: RawSalesnexusActivity): Activity {
  const done =
    typeof raw.completed === 'boolean'
      ? raw.completed
      : raw.completed === 'true'
        ? true
        : raw.completed === 'false'
          ? false
          : undefined

  return {
    id: String(raw['activity-id']),
    type: raw.type,
    subject: raw.regarding,
    note: raw.details,
    contact_id: raw['schedule-with'] ? String(raw['schedule-with']) : undefined,
    owner_id: raw['schedule-for'] ? String(raw['schedule-for']) : undefined,
    due_date: toIso(raw['start-time']),
    done,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Build parameters for create-activity / update-activity.
 */
export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject != null) out['regarding'] = data.subject
  if (data.note != null) out['details'] = data.note
  if (data.contact_id != null) out['schedule-with'] = data.contact_id
  if (data.owner_id != null) out['schedule-for'] = data.owner_id
  if (data.type != null) out['type'] = data.type
  if (data.due_date != null) out['start-time'] = data.due_date
  return out
}
