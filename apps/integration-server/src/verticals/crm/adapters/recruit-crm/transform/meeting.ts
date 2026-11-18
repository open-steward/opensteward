import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * A Recruit CRM Meeting, as returned by GET /v1/meetings and
 * GET /v1/meetings/{meeting}. Fields from the Meeting model of the Recruit CRM
 * API reference (https://docs.recruitcrm.io/docs/rcrm-api-reference/5ded6e12da789-meeting):
 * id "Meeting ID", title "Title of Meeting", description "Meeting Description",
 * start_date "Start Date and time of Meeting", owner "Owner",
 * created_on "Created On", updated_on "Updated On".
 *
 * `related_to` is the "Associated entity's slug" and is not mapped to the
 * id-keyed contact/company/deal links; `status` ("Status Of Meeting") has no
 * documented values, so `done` is not derived from it.
 */
export interface RawRecruitCrmMeeting {
  id: number
  title?: string
  description?: string
  start_date?: string
  end_date?: string
  owner?: string
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export const MEETING_ID_PREFIX = 'meeting_'

export function transformMeeting(raw: RawRecruitCrmMeeting): Activity {
  if (raw.id == null) throw new Error('Recruit CRM meeting has no id')
  return {
    id: `${MEETING_ID_PREFIX}${String(raw.id)}`,
    type: 'meeting',
    subject: raw.title,
    note: raw.description,
    due_date: toIsoDatetime(raw.start_date),
    owner_id: raw.owner != null && raw.owner !== '' ? String(raw.owner) : undefined,
    created_at: toIsoDatetime(raw.created_on),
    updated_at: toIsoDatetime(raw.updated_on),
    metadata: raw,
  }
}
