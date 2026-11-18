import type { Note } from '../../../schema/note'
import type { RawCopperActivity } from './activity'

/**
 * The activity type every Copper note carries: "By default, Copper has three
 * user-entered activity types: Notes, Phone Calls, and Meetings. Notes have a
 * hard-coded ID of 0." (https://developer.copper.com/activities/list-activity-types.html)
 *
 * Copper documents no notes resource: a note is an activity of this type, and
 * is listed, fetched, created and deleted through /activities.
 */
export const NOTE_ACTIVITY_TYPE = { category: 'user', id: 0 } as const

/** Whether an activity is a note: user-entered, of type id 0. */
export function isNoteActivity(raw: RawCopperActivity): boolean {
  return raw.type?.category === NOTE_ACTIVITY_TYPE.category && raw.type?.id === NOTE_ACTIVITY_TYPE.id
}

function unixToIso(ts: number | undefined | null): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

/**
 * A note as Copper serves it: an activity of NOTE_ACTIVITY_TYPE, whose text is
 * `details` and whose record is `parent` ("lead", "person", "company",
 * "opportunity", "project" or "task").
 */
export function transformNoteActivity(raw: RawCopperActivity): Note {
  const parentType = raw.parent?.type
  const parentId = raw.parent?.id != null ? String(raw.parent.id) : undefined
  return {
    id: String(raw.id),
    content: raw.details ?? '',
    contact_id: parentType === 'person' ? parentId : undefined,
    company_id: parentType === 'company' ? parentId : undefined,
    deal_id: parentType === 'opportunity' ? parentId : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    created_at: unixToIso(raw.date_created),
    updated_at: unixToIso(raw.date_modified),
    metadata: raw,
  }
}

/**
 * A Note as the body of POST /activities, after the documented "Create New
 * Note" example (activities/create-a-new-activity.html):
 * `{ "parent": { "type": "person", "id": 27140359 }, "type": { "category": "user", "id": 0 }, "details": "…" }`.
 */
export function untransformNoteActivity(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const parent =
    data.contact_id !== undefined
      ? { type: 'person', id: Number(data.contact_id) }
      : data.company_id !== undefined
        ? { type: 'company', id: Number(data.company_id) }
        : data.deal_id !== undefined
          ? { type: 'opportunity', id: Number(data.deal_id) }
          : undefined
  if (parent) out.parent = parent
  out.type = { ...NOTE_ACTIVITY_TYPE }
  if (data.content !== undefined) out.details = data.content
  return out
}
