/**
 * JobDiva submittal/interview/hire → canonical Activity transform.
 *
 * In JobDiva the submittal pipeline (submittal → interview → hire) is the
 * closest concept to CRM activities. We map each record to an Activity
 * with the activity type reflecting the stage name.
 *
 * Wire fields come from the /getNewSubmittalInterviewHireActivityRecords
 * and /getSubmittalsDetail endpoints.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawJobdivaActivity {
  /** Internal submittal / activity ID. */
  submittalid?: string | number
  activityid?: string | number
  id?: string | number
  /** Stage type: submittal | interview | hire | decline | etc. */
  activitytype?: string
  stage?: string
  /** Subject or title. */
  subject?: string
  /** Free-form notes. */
  notes?: string
  note?: string
  /** Candidate (contact) linked to this activity. */
  candidateid?: string | number
  /** Job (deal) linked to this activity. */
  jobid?: string | number
  /** Client company linked to this activity. */
  clientid?: string | number
  /** Record owner / recruiter. */
  ownerid?: string | number
  /** Scheduled or due date. */
  activitydate?: string
  duedate?: string
  /** Whether completed. */
  completed?: boolean
  createdat?: string
  modifiedat?: string
  [key: string]: unknown
}

/** Convert a raw JobDiva activity/submittal to a canonical Activity. Never throws. */
export function transformActivity(raw: RawJobdivaActivity): Activity {
  const id = raw.submittalid ?? raw.activityid ?? raw.id
  const activityType = raw.activitytype ?? raw.stage ?? undefined
  return {
    id: String(id ?? ''),
    type: activityType,
    subject: raw.subject ?? activityType,
    note: raw.notes ?? raw.note ?? undefined,
    contact_id: raw.candidateid != null ? String(raw.candidateid) : undefined,
    deal_id: raw.jobid != null ? String(raw.jobid) : undefined,
    company_id: raw.clientid != null ? String(raw.clientid) : undefined,
    owner_id: raw.ownerid != null ? String(raw.ownerid) : undefined,
    due_date: toIsoDatetime(raw.activitydate ?? raw.duedate),
    done: raw.completed ?? undefined,
    created_at: toIsoDatetime(raw.createdat),
    updated_at: toIsoDatetime(raw.modifiedat),
    metadata: raw,
  }
}
