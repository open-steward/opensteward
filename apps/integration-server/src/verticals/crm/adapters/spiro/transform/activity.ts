/**
 * Spiro activities (JSON:API `activity` resources) → canonical Activity.
 *
 * GET /api/v1/activities ("Returns list of all activity logged in Spiro"),
 * documented example item:
 *   { "id": "151", "type": "activity",
 *     "attributes": { "id": 151, "interacted_at": "2026-09-01T09:57:37.932Z",
 *       "subject": "ipsam", "description": "Tempore tempora accusantium aperiam.",
 *       "status": null, "disposition": "undefined", "call_status": null, "result": 0,
 *       "custom": {}, "external_id": null, "custom_activity_type": null,
 *       "call_duration": null },
 *     "relationships": { "user": { "data": { "id": "956", "type": "user" } } } }
 *
 * The JSON:API `type` is always "activity", not the activity's kind, and
 * `custom_activity_type` is null in the example with no documented values, so
 * canonical `type` is left unset. `interacted_at` is when a logged interaction
 * happened, not a due time, and `call_duration` has no documented unit: both
 * stay in metadata.
 *
 * Source: https://developers.spiro.ai/api/docs/v1/openapi.json
 */
import type { Activity } from '../../../schema/activity'
import { relatedId, type SpiroResource } from '../client'

export interface SpiroActivityAttributes {
  id: number
  interacted_at: string | null
  subject: string | null
  description: string | null
  status: string | null
  disposition: string | null
  call_status: string | null
  result: number | null
  custom: Record<string, unknown>
  external_id: string | null
  custom_activity_type: string | null
  call_duration: number | null
}

export type RawSpiroActivity = SpiroResource<SpiroActivityAttributes>

export function transformActivity(raw: RawSpiroActivity): Activity {
  const a = raw.attributes
  return {
    id: raw.id,
    subject: a.subject ?? undefined,
    note: a.description ?? undefined,
    owner_id: relatedId(raw, 'user'),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.description = data.note
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.opportunity_id = data.deal_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  if (data.due_date !== undefined) out.due_date = data.due_date
  if (data.done !== undefined) out.completed = data.done
  if (data.duration_minutes !== undefined) out.duration_minutes = data.duration_minutes
  return out
}
