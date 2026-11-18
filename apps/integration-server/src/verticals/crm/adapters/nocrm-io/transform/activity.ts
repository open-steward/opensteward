/**
 * noCRM.io Activity → canonical Activity transform.
 *
 * Wire shape (GET /activities):
 *   id, title, type (category), done, date (ISO-8601), lead_id, user_id,
 *   created_at, updated_at
 */

import type { Activity } from '../../../schema/activity'

export interface RawNocrmActivity {
  id: number | string
  title?: string | null
  /** Activity category — e.g. "call", "email", "meeting" */
  type?: string | null
  done?: boolean | null
  /** Scheduled / due date ISO-8601 */
  date?: string | null
  /** Associated lead id */
  lead_id?: number | string | null
  /** Owner user id */
  user_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawNocrmActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type ?? undefined,
    subject: raw.title ?? undefined,
    deal_id: raw.lead_id != null ? String(raw.lead_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    due_date: raw.date ?? undefined,
    done: raw.done ?? undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out['title'] = data.subject
  if (data.type !== undefined) out['type'] = data.type
  if (data.due_date !== undefined) out['date'] = data.due_date
  if (data.done !== undefined) out['done'] = data.done
  if (data.deal_id !== undefined) out['lead_id'] = Number(data.deal_id)
  if (data.owner_id !== undefined) out['user_id'] = Number(data.owner_id)
  return out
}
