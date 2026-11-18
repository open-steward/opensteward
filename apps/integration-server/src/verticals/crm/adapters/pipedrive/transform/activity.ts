import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

export interface RawPipedriveActivity {
  id: number
  type?: string
  subject?: string
  note?: string
  person_id?: number | null
  org_id?: number | null
  deal_id?: number | null
  user_id?: number | null
  due_date?: string
  due_time?: string
  done?: boolean | 0 | 1
  duration?: string
  add_time?: string
  update_time?: string
  [key: string]: unknown
}

function parseDurationMinutes(duration?: string): number | undefined {
  if (!duration) return undefined
  const [h, m] = duration.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function transformActivity(raw: RawPipedriveActivity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    note: raw.note,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    company_id: raw.org_id != null ? String(raw.org_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    due_date: raw.due_date
      ? `${raw.due_date}${raw.due_time ? `T${raw.due_time}:00` : ''}`
      : undefined,
    done: raw.done === 1 || raw.done === true,
    duration_minutes: parseDurationMinutes(raw.duration),
    created_at: raw.add_time,
    updated_at: raw.update_time,
    metadata: raw,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.type !== undefined) out.type = data.type
  if (data.subject !== undefined) out.subject = data.subject
  if (data.note !== undefined) out.note = data.note
  if (data.contact_id !== undefined) out.person_id = Number(data.contact_id)
  if (data.company_id !== undefined) out.org_id = Number(data.company_id)
  if (data.deal_id !== undefined) out.deal_id = Number(data.deal_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  if (data.due_date !== undefined) {
    const [date, time] = data.due_date.split('T')
    out.due_date = date
    if (time) out.due_time = time.substring(0, 5) // HH:MM
  }
  if (data.done !== undefined) out.done = data.done
  return out
}

// ── API v2 ──────────────────────────────────────────────────────────────────

/**
 * An activity as `GET /api/v2/activities` and `GET /api/v2/activities/{id}`
 * return it (getActivities / getActivity in
 * https://developers.pipedrive.com/docs/api/v2/openapi.yaml). v2 renames
 * `user_id` to `owner_id` ("`user_id`: 123, // Renamed to owner_id" in the
 * migration guide), returns `done` as a boolean only, and RFC 3339
 * `add_time`/`update_time`. `due_date`, `due_time` and `duration` keep their
 * v1 formats (the guide's v2 example: `"due_date": "1970-01-01"`,
 * `"due_time": "00:00"`, `"duration": "01:20"`; the spec's example has
 * `"15:00:00"` and `"01:00:00"`).
 */
export interface RawPipedriveV2Activity {
  /** "The ID of the activity" */
  id: number
  /** "The subject of the activity" */
  subject?: string
  /** "The type of the activity" */
  type?: string
  /** "The ID of the user who owns the activity" */
  owner_id?: number | null
  /** "The ID of the deal linked to the activity" (nullable) */
  deal_id?: number | null
  /** "The ID of the person linked to the activity" (nullable) */
  person_id?: number | null
  /** "The ID of the organization linked to the activity" (nullable) */
  org_id?: number | null
  /** "The due date of the activity" */
  due_date?: string | null
  /** "The due time of the activity" (nullable) — v1 documents it "in UTC" */
  due_time?: string | null
  /** "The duration of the activity" (nullable) */
  duration?: string | null
  /** "Whether the activity is marked as done or not" */
  done?: boolean
  /** "The note of the activity" */
  note?: string | null
  /** "The creation date and time of the activity" */
  add_time?: string
  /** "The last updated date and time of the activity" */
  update_time?: string | null
  [key: string]: unknown
}

/** `HH:MM` or `HH:MM:SS` → whole minutes. */
function durationMinutesV2(duration: string | null | undefined): number | undefined {
  if (!duration) return undefined
  const m = /^(\d+):(\d{2})(?::\d{2})?$/.exec(duration)
  if (!m) return undefined
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * `due_date` plus `due_time`, read as UTC: v1 documents due_time as "The due
 * time of the activity in UTC. Format: HH:MM", and the v2 migration guide
 * lists no change to it. A date with no time is that day's UTC midnight.
 */
function dueDateV2(
  date: string | null | undefined,
  time: string | null | undefined,
): string | undefined {
  if (!date) return undefined
  if (!time) return toIsoDatetime(date)
  return toIsoDatetime(`${date}T${time}Z`)
}

export function transformActivityV2(raw: RawPipedriveV2Activity): Activity {
  return {
    id: String(raw.id),
    type: raw.type,
    subject: raw.subject,
    note: raw.note ?? undefined,
    contact_id: raw.person_id != null ? String(raw.person_id) : undefined,
    company_id: raw.org_id != null ? String(raw.org_id) : undefined,
    deal_id: raw.deal_id != null ? String(raw.deal_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    due_date: dueDateV2(raw.due_date, raw.due_time),
    done: raw.done,
    duration_minutes: durationMinutesV2(raw.duration),
    created_at: toIsoDatetime(raw.add_time),
    updated_at: toIsoDatetime(raw.update_time),
    metadata: raw,
  }
}
