import type { Activity } from '../../../schema/activity'
import { entityId, refId, str, type TeamworkRef } from '../raw'

/**
 * The Activity model of `GET /activities.json` (`activities[]`) and
 * `GET /activities/{id}.json` (`activity`), documented fields only
 * (https://web.archive.org/web/20200810124444id_/https://developer.teamwork.com/crm/api-reference/activities/get-activitiesjson).
 */
export interface RawTeamworkActivity {
  id: number
  title?: string | null
  description?: string | null
  deal?: TeamworkRef | null
  contacts?: TeamworkRef[] | null
  /** "Number of contacts connected to the activity." */
  contactsCount?: number | null
  isComplete?: boolean | null
  dueDate?: string | null
  /** "Duration in minutes of how long the activity will take to complete." */
  duration?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

/** The one linked contact, when the activity has exactly one and it came back. */
function soleContact(raw: RawTeamworkActivity): string | undefined {
  const contacts = raw.contacts ?? []
  return raw.contactsCount === 1 && contacts.length === 1 ? refId(contacts[0]) : undefined
}

export function transformActivity(raw: RawTeamworkActivity): Activity {
  return {
    id: entityId(raw, 'activity'),
    subject: str(raw.title),
    note: str(raw.description),
    deal_id: refId(raw.deal),
    contact_id: soleContact(raw),
    due_date: str(raw.dueDate),
    done: typeof raw.isComplete === 'boolean' ? raw.isComplete : undefined,
    duration_minutes:
      typeof raw.duration === 'number' && Number.isInteger(raw.duration) && raw.duration >= 0
        ? raw.duration
        : undefined,
    created_at: str(raw.createdAt),
    updated_at: str(raw.updatedAt),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.type = data.type
  if (data.due_date !== undefined) out.dueDate = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  return out
}
