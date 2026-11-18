/**
 * JobAdder UserTask ↔ canonical Activity.
 *
 * Maps GET /usertasks / GET /usertasks/{taskId} responses.
 *
 * JobAdder exposes user tasks (internal to-do items) as the closest analogue
 * to the CRM Activity concept. Both the list summary and the single-item
 * representation share the same core fields; the full representation adds
 * linked entity arrays (candidates, contacts, companies, jobs).
 *
 * API fields (camelCase on the wire):
 *   taskId, text, startAt, endAt, allDay, reminderMinutes, complete,
 *   owner.{ userId, name }, assignedTo.{ userId, name },
 *   candidates[].{ candidateId }, contacts[].{ contactId },
 *   companies[].{ companyId }, jobs[].{ jobId },
 *   createdAt, updatedAt
 *
 * Endpoint:  GET /usertasks          → list (UserTaskSummaryModel)
 *            GET /usertasks/{taskId} → single (UserTaskRepresentation)
 *
 * Write support: the public JobAdder API v2 exposes only GET on both
 * /usertasks and /usertasks/{taskId} — create/update/delete are not
 * available.
 */

import type { Activity } from '../../../schema/activity'
import { toIsoDatetime } from '@opensteward/shared'

/** Minimal user ref shared across list and detail responses. */
interface UserNameModel {
  userId?: number | string
  name?: string
  [key: string]: unknown
}

/** List-item shape (UserTaskSummaryModel — no linked entities). */
export interface RawJobAdderUserTask {
  taskId: number | string
  text?: string
  startAt?: string
  endAt?: string
  allDay?: boolean
  reminderMinutes?: number
  complete?: boolean
  owner?: UserNameModel
  assignedTo?: UserNameModel
  /** Present on full UserTaskRepresentation only. */
  candidates?: Array<{ candidateId?: number | string; [key: string]: unknown }>
  contacts?: Array<{ contactId?: number | string; [key: string]: unknown }>
  companies?: Array<{ companyId?: number | string; [key: string]: unknown }>
  jobs?: Array<{ jobId?: number | string; [key: string]: unknown }>
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

/**
 * Compute duration in whole minutes from startAt/endAt ISO strings.
 * Returns undefined when either field is absent or the result is negative.
 */
function toDurationMinutes(startAt?: string, endAt?: string): number | undefined {
  if (!startAt || !endAt) return undefined
  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined
  const minutes = Math.round((end - start) / 60_000)
  return minutes >= 0 ? minutes : undefined
}

export function transformActivity(raw: RawJobAdderUserTask): Activity {
  return {
    id: String(raw.taskId),
    type: 'task',
    subject: raw.text ?? undefined,
    note: undefined,
    contact_id:
      raw.contacts?.[0]?.contactId != null
        ? String(raw.contacts[0].contactId)
        : raw.candidates?.[0]?.candidateId != null
          ? String(raw.candidates[0].candidateId)
          : undefined,
    company_id:
      raw.companies?.[0]?.companyId != null
        ? String(raw.companies[0].companyId)
        : undefined,
    deal_id:
      raw.jobs?.[0]?.jobId != null ? String(raw.jobs[0].jobId) : undefined,
    owner_id:
      raw.owner?.userId != null ? String(raw.owner.userId) : undefined,
    due_date: toIsoDatetime(raw.startAt),
    done: raw.complete ?? undefined,
    duration_minutes: toDurationMinutes(raw.startAt, raw.endAt),
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
