import type { Activity } from '../../../schema/activity'
import { espoDateToIso, espoDatetimeToIso } from './datetime'
import { requireString } from './required'

// EspoCRM Task entity (maps to Activity). Fields from docs.espocrm.com/api/spec.json
// components.schemas.Task; Task has no activity-kind field.
export interface RawEspoCrmTask {
  id?: string
  name?: string
  description?: string
  parentType?: string
  parentId?: string
  contactId?: string
  accountId?: string
  assignedUserId?: string
  dateStart?: string | null
  /** spec.json: {"type":["string","null"],"pattern":"^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$"}; labelled "Date Due" (Task.json i18n). */
  dateEnd?: string | null
  /** spec.json: {"type":["string","null"],"format":"date"}; the all-day form of dateEnd, "Date End (all day)". */
  dateEndDate?: string | null
  status?: string
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawEspoCrmTask): Activity {
  const done = raw.status === 'Completed'
  return {
    id: requireString(raw.id, 'Task.id'),
    subject: raw.name,
    note: raw.description,
    contact_id: raw.contactId,
    company_id:
      raw.accountId ?? (raw.parentType === 'Account' ? (raw.parentId as string) : undefined),
    deal_id: raw.parentType === 'Opportunity' ? (raw.parentId as string) : undefined,
    owner_id: raw.assignedUserId,
    // The due date is dateEnd ("dateEnd": "Date Due" in the vendor's Task.json
    // labels); an all-day task carries it as the date-only dateEndDate.
    due_date:
      typeof raw.dateEndDate === 'string' && raw.dateEndDate !== ''
        ? espoDateToIso(raw.dateEndDate)
        : espoDatetimeToIso(raw.dateEnd),
    done,
    created_at: espoDatetimeToIso(raw.createdAt),
    updated_at: espoDatetimeToIso(raw.modifiedAt),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.activityType = data.type
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.due_date !== undefined) out.dateStart = data.due_date
  if (data.done !== undefined) out.status = data.done ? 'Completed' : 'Not Started'
  return out
}
