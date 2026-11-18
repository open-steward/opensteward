import type { Activity } from '../../../schema/activity'

/**
 * Salesflare calls activities "Tasks".
 */
export interface RawSalesflareActivity {
  id: number
  description?: string
  type?: { id: number; name?: string } | null
  account?: { id: number } | null
  contact?: { id: number } | null
  opportunity?: { id: number } | null
  assignee?: { id: number } | null
  due_date?: string
  completed?: boolean
  creation_time?: string
  modification_time?: string
  [key: string]: unknown
}

export function transformActivity(raw: RawSalesflareActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type?.name,
    subject: raw.description,
    company_id: raw.account?.id != null ? String(raw.account.id) : undefined,
    contact_id: raw.contact?.id != null ? String(raw.contact.id) : undefined,
    deal_id: raw.opportunity?.id != null ? String(raw.opportunity.id) : undefined,
    owner_id: raw.assignee?.id != null ? String(raw.assignee.id) : undefined,
    due_date: raw.due_date,
    done: raw.completed ?? false,
    created_at: raw.creation_time,
    updated_at: raw.modification_time,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.description = data.subject
  if (data.type !== undefined) out.type = { name: data.type }
  if (data.company_id !== undefined) out.account = { id: Number(data.company_id) }
  if (data.contact_id !== undefined) out.contact = { id: Number(data.contact_id) }
  if (data.deal_id !== undefined) out.opportunity = { id: Number(data.deal_id) }
  if (data.owner_id !== undefined) out.assignee = { id: Number(data.owner_id) }
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.completed = data.done
  return out
}
