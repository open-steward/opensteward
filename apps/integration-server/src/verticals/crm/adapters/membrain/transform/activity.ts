import type { Activity } from '../../../schema/activity'
import { flag, related, required, text, utcDate } from '../fields'

/**
 * An Activity as GET /activities/ and GET /activities/{Id} return it
 * (https://www.membrain.com/developers/api-documentation, "GET /activities/"
 * Example Result and Properties).
 */
export interface RawMembrainActivity {
  Id: string
  Type?: string
  Subject?: string
  Contents?: string
  Completed?: string
  Deadline?: string
  HasExplicitTime?: string
  Relateds?: unknown
  [key: string]: unknown
}

/**
 * Type: 'Either "Activity", "Call", "Note", "Email" or "Task". Note that
 * "Appointments" have the "Type" set to "Activity" in this API version.'
 */
const TYPES: Record<string, string> = {
  Activity: 'meeting',
  Call: 'call',
  Note: 'note',
  Email: 'email',
  Task: 'task',
}

/**
 * A Task's Deadline as an instant, only when its time is meaningful.
 *
 * GET /activities/ Properties: "Deadline for a Task. NOTE: The Deadline field
 * value only has significance for Tasks"; "HasExplicitTime: Boolean. This
 * value relates to the Deadline and is only relevant for Tasks. If set to
 * true, the time part of the Deadline field has significance if it exists,
 * otherwise it does not."
 *
 * The GET properties state no zone. UTC is read from the same field's
 * documented write form ("Deadline for an Activity in UTC (Only for Tasks)",
 * POST /appointments/ | POST /tasks/ | POST /calls/ | POST /notes/), which the
 * API stores and returns. A date-only deadline (HasExplicitTime "false") has
 * no instant to give, so it is omitted rather than pinned to UTC midnight.
 */
function taskDeadline(raw: RawMembrainActivity): string | undefined {
  if (flag(raw.HasExplicitTime) !== true) return undefined
  return utcDate(raw.Deadline)
}

export function transformActivity(raw: RawMembrainActivity): Activity {
  const type = text(raw.Type)
  return {
    id: required(raw.Id, 'Id', 'activity'),
    type: type !== undefined ? (TYPES[type] ?? type) : undefined,
    subject: text(raw.Subject),
    note: text(raw.Contents),
    done: flag(raw.Completed),
    due_date: type === 'Task' ? taskDeadline(raw) : undefined,
    company_id: related(raw.Relateds, 'Company'),
    deal_id: related(raw.Relateds, 'Opportunity'),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) out.contact = { id: data.contact_id }
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  if (data.deal_id !== undefined) out.deal = { id: data.deal_id }
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  return out
}
