import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * A Recruit CRM Call Log, as returned by GET /v1/call-logs and
 * GET /v1/call-logs/{call_log}. Fields from the CallLog model of the Recruit
 * CRM API reference (https://docs.recruitcrm.io/docs/rcrm-api-reference/ea4e8eee3266c-call-log):
 * id "CallLog ID", call_started_on "Call Start Date Time",
 * call_notes "Call Notes", duration ("… The response will be in seconds."),
 * created_on "Created On", updated_on "Updated On".
 *
 * The model has no owner and no title. `related_to` is the "Associated
 * entity's slug" and is not mapped to the id-keyed contact/company/deal links.
 */
export interface RawRecruitCrmCallLog {
  id: number
  call_type?: string
  call_started_on?: string
  call_notes?: string
  duration?: string | number
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export const CALL_LOG_ID_PREFIX = 'call-log_'

/** `duration` is documented in seconds in the response; the canonical field is whole minutes. */
function durationMinutes(duration: string | number | undefined): number | undefined {
  if (duration == null) return undefined
  const text = String(duration).trim()
  if (!/^\d+$/.test(text)) return undefined
  return Math.round(Number(text) / 60)
}

export function transformCallLog(raw: RawRecruitCrmCallLog): Activity {
  if (raw.id == null) throw new Error('Recruit CRM call log has no id')
  return {
    id: `${CALL_LOG_ID_PREFIX}${String(raw.id)}`,
    type: 'call',
    note: raw.call_notes,
    due_date: toIsoDatetime(raw.call_started_on),
    duration_minutes: durationMinutes(raw.duration),
    created_at: toIsoDatetime(raw.created_on),
    updated_at: toIsoDatetime(raw.updated_on),
    metadata: raw,
  }
}
