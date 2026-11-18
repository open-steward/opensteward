import type { Activity } from '../../../schema/activity'

// Bullhorn "Task" entity mapped as activities
export interface RawBullhornActivity {
  id: number
  type?: string
  subject?: string
  description?: string
  isCompleted?: boolean
  dateBegin?: number
  dateEnd?: number
  clientContact?: { id?: number }
  clientCorporation?: { id?: number }
  jobOrder?: { id?: number }
  owner?: { id?: number }
  dateAdded?: number
  dateLastModified?: number
  [key: string]: unknown
}

export function transformActivity(raw: RawBullhornActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    note: raw.description,
    contact_id: raw.clientContact?.id != null ? String(raw.clientContact.id) : undefined,
    company_id: raw.clientCorporation?.id != null ? String(raw.clientCorporation.id) : undefined,
    deal_id: raw.jobOrder?.id != null ? String(raw.jobOrder.id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    due_date: raw.dateEnd != null ? new Date(raw.dateEnd).toISOString() : undefined,
    done: raw.isCompleted ?? false,
    created_at: raw.dateAdded != null ? new Date(raw.dateAdded).toISOString() : undefined,
    updated_at: raw.dateLastModified != null ? new Date(raw.dateLastModified).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.type !== undefined) out.type = data.type
  if (data.note !== undefined) out.description = data.note
  if (data.due_date !== undefined) out.dateEnd = data.due_date
  if (data.done !== undefined) out.isCompleted = data.done
  if (data.contact_id !== undefined) out.clientContact = { id: Number(data.contact_id) }
  if (data.company_id !== undefined) out.clientCorporation = { id: Number(data.company_id) }
  if (data.deal_id !== undefined) out.jobOrder = { id: Number(data.deal_id) }
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  return out
}
