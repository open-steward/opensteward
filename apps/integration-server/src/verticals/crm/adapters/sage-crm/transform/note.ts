import type { Note } from '../../../schema/note'
import { optDate, requireKey } from '../records'

/** components.schemas.Notes of the Sage CRM 2024 R2 RESTful API reference (fields read here). */
export interface RawSageCrmNote {
  Note_NoteId?: number
  Note_Note?: string
  Note_ForeignTableId?: number
  Note_ForeignId?: number
  Note_CreatedDate?: string
  Note_UpdatedDate?: string
  [key: string]: unknown
}

/**
 * contact_id / company_id / deal_id are omitted: a note names its parent by
 * Note_ForeignTableId + Note_ForeignId, and the reference does not document
 * which table id is Person, Company or Opportunity. Both stay in `metadata`.
 * Note_CreatedBy is omitted: documented only as `string`, not as a user id.
 */
export function transformNote(raw: RawSageCrmNote): Note {
  const id = requireKey(raw.Note_NoteId, 'Note_NoteId')
  if (typeof raw.Note_Note !== 'string') {
    throw Object.assign(new Error(`Sage CRM note ${id} has no Note_Note`), { statusCode: 502 })
  }
  const note: Note = { id, content: raw.Note_Note, metadata: raw }
  const created = optDate(raw.Note_CreatedDate)
  if (created) note.created_at = created
  const updated = optDate(raw.Note_UpdatedDate)
  if (updated) note.updated_at = updated
  return note
}

// Write mapping below is unchanged by the read rebuild (write methods are out
// of its scope); its field names are not from the documented Notes schema.
export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note_note = data.content
  if (data.contact_id !== undefined) out.pers_personid = Number(data.contact_id)
  if (data.company_id !== undefined) out.comp_companyid = Number(data.company_id)
  if (data.deal_id !== undefined) out.oppo_opportunityid = Number(data.deal_id)
  return out
}
