import type { Activity } from '../../../schema/activity'

export interface RawNutshellActivity {
  id: number | string
  type?: string
  /** Activity title / description */
  name?: string
  note?: string
  /** Associated contacts */
  contacts?: Array<{ id: number | string }>
  /** Associated accounts */
  accounts?: Array<{ id: number | string }>
  /** Associated leads/deals */
  leads?: Array<{ id: number | string }>
  assignee?: { id: number | string } | null
  dueTime?: string
  isCompleted?: boolean
  duration?: number | null
  createdTime?: string
  modifiedTime?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawNutshellActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.name,
    note: raw.note,
    contact_id: raw.contacts?.[0]?.id != null ? String(raw.contacts[0].id) : undefined,
    company_id: raw.accounts?.[0]?.id != null ? String(raw.accounts[0].id) : undefined,
    deal_id: raw.leads?.[0]?.id != null ? String(raw.leads[0].id) : undefined,
    owner_id: raw.assignee?.id != null ? String(raw.assignee.id) : undefined,
    due_date: raw.dueTime,
    done: raw.isCompleted ?? false,
    duration_minutes: raw.duration != null ? raw.duration : undefined,
    created_at: raw.createdTime,
    updated_at: raw.modifiedTime,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) {
    out.contacts = [{ id: Number(data.contact_id), entityType: 'Contacts' }]
  }
  if (data.company_id !== undefined) {
    out.accounts = [{ id: Number(data.company_id), entityType: 'Accounts' }]
  }
  if (data.deal_id !== undefined) {
    out.leads = [{ id: Number(data.deal_id), entityType: 'Leads' }]
  }
  if (data.owner_id !== undefined) {
    out.assignee = { id: Number(data.owner_id), entityType: 'Users' }
  }
  if (data.due_date !== undefined) out.dueTime = data.due_date
  if (data.done !== undefined) out.isCompleted = data.done
  if (data.duration_minutes !== undefined) out.duration = data.duration_minutes
  return out
}
