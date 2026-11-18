import type { Activity } from '../../../schema/activity'
import { requireKey, str, zonedIso } from '../octopus'

/**
 * A Task (https://developer.maximizer.com/reference/octopus-api-docs-objects-task):
 * "A Task is a scheduled action, assigned to a user". The Read example scopes
 * Key, AssignedTo, DateTime, Alarm, SnoozeUntil, Priority, Completed, Activity,
 * WithKey, LeadKey and AbEntryKey; Create sends "Activity": "Call" ("Check
 * field options to see Activity available options") and "Completed": false.
 */
export interface RawMaximizerActivity {
  Key: string
  Activity?: string | null
  DateTime?: string | null
  Completed?: boolean | null
  [key: string]: unknown
}

export function transformActivity(raw: RawMaximizerActivity): Activity {
  return {
    id: requireKey(raw, 'Task'),
    type: 'task',
    subject: str(raw.Activity),
    due_date: zonedIso(raw.DateTime),
    done: typeof raw.Completed === 'boolean' ? raw.Completed : undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.ActivityType = data.type
  if (data.subject !== undefined) out.Subject = data.subject
  if (data.due_date !== undefined) out.DueDate = data.due_date
  if (data.done !== undefined) out.Completed = data.done
  if (data.contact_id !== undefined) out.ContactKey = data.contact_id
  if (data.company_id !== undefined) out.CompanyKey = data.company_id
  if (data.deal_id !== undefined) out.OpportunityKey = data.deal_id
  if (data.owner_id !== undefined) out.AssignedTo = data.owner_id
  return out
}
