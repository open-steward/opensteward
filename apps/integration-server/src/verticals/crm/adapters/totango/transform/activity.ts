/**
 * Totango timeline event ↔ canonical Activity.
 *
 * Touchpoints API: "Use the type property to distinguish between touchpoints
 * (type=’note’), tasks (type=’task’), and other items." Search API (events):
 * "Optional values for event_type are "note" (touchpoint), "campaign_touch:
 * (campaigns event), "alert" (health change), "task" (task event - created,
 * updated, completed)".
 * https://support.totango.com/hc/en-us/articles/115000597266-Touchpoints-API
 * https://support.totango.com/hc/en-us/articles/360048132792-Search-API-events
 *
 * Fields read, all from the documented event samples: `id`, `type`,
 * `timestamp`, `account.id`, `note_content.text`,
 * `note_content.totango_user.user_name` and `properties.subject`.
 */

import type { Activity } from '../../../schema/activity'
import type { RawTotangoEvent } from '../client'

export type { RawTotangoEvent }

function epochMsToIso(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : undefined
}

export function transformActivity(raw: RawTotangoEvent): Activity {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw Object.assign(new Error('Totango event has no id'), { statusCode: 502 })
  }
  const activity: Activity = { id: raw.id, metadata: raw }
  if (typeof raw.type === 'string' && raw.type !== '') activity.type = raw.type
  const subject = raw.properties?.subject
  if (typeof subject === 'string' && subject !== '') activity.subject = subject
  const text = raw.note_content?.text
  if (typeof text === 'string') activity.note = text
  const accountId = raw.account?.id
  if (typeof accountId === 'string' && accountId !== '') activity.company_id = accountId
  const author = raw.note_content?.totango_user?.user_name
  if (author) activity.owner_id = author
  const created = epochMsToIso(raw.timestamp)
  if (created) activity.created_at = created
  return activity
}

/** Canonical Activity → the documented POST /api/v3/touchpoints fields. */
export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.activity_type_id = data.type
  if (data.note !== undefined) out.content = data.note
  if (data.subject !== undefined) out.subject = data.subject
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.owner_id !== undefined) out.created_by = data.owner_id
  return out
}
