/**
 * Transform between EngageBay task wire format and canonical Activity.
 *
 * EngageBay "tasks" map to canonical activities.
 * Task fields: id, name (subject), description (note), type (TODO/EMAIL/CALL),
 * task_milestone (status), closed_date (epoch ms due date), contact_ids,
 * company_ids, deal_ids, owner_id.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawEngageBayTask {
  id?: number | string
  name?: string
  description?: string
  type?: string
  task_milestone?: string
  closed_date?: number | string
  contact_ids?: Array<number | string>
  company_ids?: Array<number | string>
  deal_ids?: Array<number | string>
  owner_id?: number | string
  created_time?: number | string
  updated_time?: number | string
  [key: string]: unknown
}

/** Map EngageBay task type to a canonical activity type. */
function mapType(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const map: Record<string, string> = {
    TODO: 'task',
    EMAIL: 'email',
    CALL: 'call',
  }
  return map[raw.toUpperCase()] ?? raw.toLowerCase()
}

/** Map EngageBay task_milestone to canonical `done` flag. */
function isDone(milestone: string | undefined): boolean | undefined {
  if (milestone === undefined) return undefined
  return milestone.toLowerCase() === 'completed'
}

export function transformActivity(raw: RawEngageBayTask): Activity {
  return {
    id: String(raw.id ?? ''),
    type: mapType(raw.type),
    subject: raw.name,
    note: raw.description,
    contact_id:
      raw.contact_ids && raw.contact_ids.length > 0
        ? String(raw.contact_ids[0])
        : undefined,
    company_id:
      raw.company_ids && raw.company_ids.length > 0
        ? String(raw.company_ids[0])
        : undefined,
    deal_id:
      raw.deal_ids && raw.deal_ids.length > 0
        ? String(raw.deal_ids[0])
        : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: toIsoDatetime(raw.closed_date),
    done: isDone(raw.task_milestone),
    created_at: toIsoDatetime(raw.created_time),
    updated_at: toIsoDatetime(raw.updated_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapTypeReverse(canonical: string | undefined): string | undefined {
  if (!canonical) return undefined
  const map: Record<string, string> = {
    task: 'TODO',
    email: 'EMAIL',
    call: 'CALL',
  }
  return map[canonical.toLowerCase()] ?? canonical.toUpperCase()
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.name = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.type !== undefined) out.type = mapTypeReverse(data.type)
  if (data.done !== undefined) out.task_milestone = data.done ? 'completed' : 'not_started'
  if (data.due_date !== undefined) {
    const d = new Date(data.due_date)
    if (!Number.isNaN(d.getTime())) out.closed_date = d.getTime()
  }
  if (data.contact_id !== undefined) out.contact_ids = [Number(data.contact_id)]
  if (data.company_id !== undefined) out.company_ids = [Number(data.company_id)]
  if (data.deal_id !== undefined) out.deal_ids = [Number(data.deal_id)]
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
