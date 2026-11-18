import { toIsoDatetime } from '@opensteward/shared'
import type { Activity } from '../../../schema/activity'

/**
 * One reminder as GET /v1/reminders/ (`data.items[]`) and
 * GET /v1/reminders/{reminderId} (`data`) return it. Dex reminders map to CRM
 * activities of type `task`.
 *
 * Fields from https://getdex.com/docs/api-reference/reference/v1/reminders/list-reminders
 * ("data.items[].id string (uuid) required", "data.items[].text string | null",
 * "data.items[].due_at_date string (date-time)", "data.items[].due_at_time string (date-time)",
 * "data.items[].is_complete boolean", "data.items[].created_at string (date-time)",
 * "data.items[].reminders_contacts array<object>"). v1 documents no title and no
 * updated_at on a reminder.
 *
 * The `reminders_contacts` row's `contact_id` is the field the same API
 * documents for that relation in the POST /v1/reminders/ and
 * PUT /v1/reminders/{reminderId} request bodies ({contact_id, contacts}).
 */
export interface RawDexReminder {
  id: string
  text?: string | null
  due_at_date?: string | null
  due_at_time?: string | null
  is_complete?: boolean
  recurrence?: string | null
  created_at?: string | null
  reminders_contacts?: Array<{ contact_id?: string | null }>
  [key: string]: unknown
}

export function transformActivity(raw: RawDexReminder): Activity {
  const contactId = raw.reminders_contacts?.[0]?.contact_id
  return {
    id: String(raw.id),
    type: 'task',
    subject: raw.text ?? undefined,
    contact_id: contactId ? String(contactId) : undefined,
    // due_at_date is documented as a date-time. How due_at_time combines with
    // it is not documented, so it stays in metadata rather than being guessed.
    due_date: toIsoDatetime(raw.due_at_date),
    done: raw.is_complete,
    created_at: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformActivity(data: Partial<Activity>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.subject !== undefined) out.title = data.subject
  if (data.note !== undefined) out.text = data.note
  if (data.due_date !== undefined) {
    // Split ISO date from optional time; strip Z/offset suffix from time portion.
    const [date, rawTime] = (data.due_date ?? '').split('T')
    out.due_at_date = date
    if (rawTime) {
      // Remove trailing Z or ±HH:MM offset so Dex receives plain HH:MM:SS
      const time = rawTime.replace(/[Z+-]\d*:?\d*$/, '').replace(/\.\d+$/, '')
      if (time) out.due_at_time = time
    }
  }
  if (data.done !== undefined) out.is_complete = data.done
  if (data.contact_id !== undefined) {
    out.reminders_contacts = { data: [{ contact_id: data.contact_id }] }
  }
  return out
}
