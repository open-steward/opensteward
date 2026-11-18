import type { Activity } from '../../../schema/activity'

/**
 * Teamgate activity fields from GET /v4/activities:
 *   id, subject, type (activity kind), status, createdTime, updatedTime,
 *   ownerId
 *
 * The "leads" and "deals" association arrays are complex nested objects;
 * for simplicity we extract the first lead/deal id when present.
 */
export interface RawTeamgateActivity {
  id: number | string
  subject?: string
  type?: string
  status?: string
  leads?: Array<{ id?: number | string }> | string
  deals?: Array<{ id?: number | string }> | string
  ownerId?: number | string
  createdTime?: string
  updatedTime?: string
  [key: string]: unknown
}

function toIso(ts: string | undefined): string | undefined {
  if (!ts) return undefined
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

function firstId(
  arr: Array<{ id?: number | string }> | string | undefined,
): string | undefined {
  if (!arr) return undefined
  if (!Array.isArray(arr) || arr.length === 0) return undefined
  const id = arr[0]?.id
  return id != null ? String(id) : undefined
}

export function transformActivity(raw: RawTeamgateActivity): Activity {
  const done =
    typeof raw.status === 'string'
      ? raw.status.toLowerCase() === 'done' || raw.status.toLowerCase() === 'completed'
      : undefined

  return {
    id: String(raw.id),
    type: typeof raw.type === 'string' && raw.type ? raw.type.toLowerCase() : undefined,
    subject: typeof raw.subject === 'string' && raw.subject ? raw.subject : undefined,
    deal_id: firstId(Array.isArray(raw.deals) ? raw.deals : undefined),
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    done,
    created_at: toIso(raw.createdTime),
    updated_at: toIso(raw.updatedTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.subject = data.subject
  if (data.type !== undefined) out.type = data.type
  if (data.done !== undefined) out.status = data.done ? 'done' : 'open'
  return out
}
