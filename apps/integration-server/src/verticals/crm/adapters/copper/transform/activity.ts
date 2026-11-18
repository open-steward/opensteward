import type { Activity } from '../../../schema/activity'

export interface RawCopperActivity {
  id: number
  type?: {
    id?: number
    category?: string
    name?: string
  }
  details?: string
  activity_date?: number | null
  parent?: {
    id?: number
    type?: string
  }
  user_id?: number | null
  date_created?: number
  date_modified?: number
  [key: string]: unknown
}

function unixToIso(ts: number | undefined | null): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformActivity(raw: RawCopperActivity): Activity {
  const parentType = raw.parent?.type
  const parentId = raw.parent?.id != null ? String(raw.parent.id) : undefined

  return {
    id: String(raw.id),
    type: raw.type?.category ?? raw.type?.name,
    note: raw.details,
    contact_id: parentType === 'person' ? parentId : undefined,
    deal_id: parentType === 'opportunity' ? parentId : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    due_date: unixToIso(raw.activity_date),
    created_at: unixToIso(raw.date_created),
    updated_at: unixToIso(raw.date_modified),
    metadata: raw,
  }
}

/**
 * Activities are read-only in Copper v1 — untransform is provided for
 * completeness but no create/update endpoints are called.
 */
export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.note !== undefined) out.details = data.note
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  return out
}
