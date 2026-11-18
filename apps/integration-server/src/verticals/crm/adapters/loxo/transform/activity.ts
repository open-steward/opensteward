import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * Raw Loxo person_event response shape.
 * Loxo stores activities as person_events (GET/POST /person_events).
 * The `notes` field holds the body text; `activity_type` classifies the event.
 */
export interface RawLoxoActivity {
  id: number | string
  /** Activity type object with at least a `name` string. */
  activity_type?: { id?: number | string; name?: string; [k: string]: unknown } | null
  /** Free-text body / description of the event. */
  notes?: string | null
  /** Person (contact) linked to this event. */
  person_id?: number | string | null
  /** Job linked to this event. */
  job_id?: number | string | null
  /** Company linked to this event. */
  company_id?: number | string | null
  /** ID of the user who created this event. */
  created_by_id?: number | string | null
  /** Whether the event is pinned. */
  pinned?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformActivity(raw: RawLoxoActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.activity_type?.name ?? undefined,
    subject: undefined,
    note: raw.notes ?? undefined,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    deal_id: undefined,
    owner_id: raw.created_by_id != null ? String(raw.created_by_id) : undefined,
    due_date: undefined,
    done: undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const inner: Record<string, unknown> = {}
  if (data.note !== undefined) inner['notes'] = data.note
  if (data.contact_id !== undefined) inner['person_id'] = data.contact_id
  if (data.owner_id !== undefined) inner['created_by_id'] = data.owner_id
  return { person_event: inner }
}
