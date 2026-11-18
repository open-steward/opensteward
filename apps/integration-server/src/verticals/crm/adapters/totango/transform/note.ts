/**
 * Totango touchpoint (timeline event of type "note") ↔ canonical Note.
 *
 * Touchpoints API, "Retrieve events per account":
 *   "For brevity, we are only showing an event of type “note”, which is the
 *    internal name used for a touchpoint."
 *   "The text of the touchpoint is accessible in note_content.text. The user who
 *    authored the touchpoint is available under note_content.totango_user.user_name
 *    (email address as registered in Totango)."
 * https://support.totango.com/hc/en-us/articles/115000597266-Touchpoints-API
 *
 * The event's `timestamp` is when the touchpoint was registered on the timeline
 * (create_date: "The touchpoint will registered at this time").
 */

import type { Note } from '../../../schema/note'
import type { RawTotangoEvent } from '../client'

export type RawTotangoNote = RawTotangoEvent

function epochMsToIso(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : undefined
}

export function transformNote(raw: RawTotangoNote): Note {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw Object.assign(new Error('Totango event has no id'), { statusCode: 502 })
  }
  const text = raw.note_content?.text
  if (typeof text !== 'string') {
    throw Object.assign(new Error(`Totango event ${raw.id} has no note_content.text`), {
      statusCode: 502,
    })
  }
  const note: Note = { id: raw.id, content: text, metadata: raw }
  const accountId = raw.account?.id
  if (typeof accountId === 'string' && accountId !== '') note.company_id = accountId
  const author = raw.note_content?.totango_user?.user_name
  if (author) note.owner_id = author
  const created = epochMsToIso(raw.timestamp)
  if (created) note.created_at = created
  return note
}

/** Canonical Note → the documented POST /api/v3/touchpoints fields. */
export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.owner_id !== undefined) out.created_by = data.owner_id
  return out
}
