import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * A task (phone call or to-do) as "Get activity list" / "Get activity" return
 * it (GET /api/v2/activities). Documented properties read here: `description`,
 * `notes`, `date` ("When you should complete this Phone call"), `closeDate`
 * ("Date when this phone call was completed"), `client`, `contacts` ("Which
 * (one) contact"), `users` ("Which user should complete this phone call"),
 * `activityType`, `opportunity`, `regDate`, `modDate`.
 */
export interface RawUpsalesActivity {
  id: number | string
  description?: string | null
  notes?: string | null
  activityType?: { id: number | string; name?: string } | null
  date?: string | null
  closeDate?: string | null
  contacts?: Array<{ id: number | string }> | null
  client?: { id: number | string } | null
  opportunity?: { id: number | string } | null
  users?: Array<{ id: number | string }> | null
  regDate?: string | null
  modDate?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawUpsalesActivity): Activity {
  const users = raw.users ?? []
  const contact = raw.contacts?.[0]
  return {
    id: String(raw.id),
    type: raw.activityType?.name,
    subject: raw.description ?? undefined,
    note: raw.notes ? raw.notes : undefined,
    contact_id: contact?.id != null ? String(contact.id) : undefined,
    company_id: raw.client?.id != null ? String(raw.client.id) : undefined,
    deal_id: raw.opportunity?.id != null ? String(raw.opportunity.id) : undefined,
    owner_id: users.length === 1 ? String(users[0]!.id) : undefined,
    due_date: toIsoDatetime(raw.date),
    done: raw.closeDate != null,
    created_at: toIsoDatetime(raw.regDate),
    updated_at: toIsoDatetime(raw.modDate),
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.description = data.subject
  if (data.type !== undefined) out.activityType = { name: data.type }
  if (data.contact_id !== undefined) out.contacts = [{ id: Number(data.contact_id) }]
  if (data.company_id !== undefined) out.client = { id: Number(data.company_id) }
  if (data.deal_id !== undefined) out.opportunity = { id: Number(data.deal_id) }
  if (data.owner_id !== undefined) out.user = { id: Number(data.owner_id) }
  if (data.due_date !== undefined) out.date = data.due_date
  return out
}
