/**
 * Nimble contact note → canonical Note.
 *
 * Shape: `Contacts.ContactNote` in the OpenAPI spec embedded in
 * https://www.nimble.com/developers/docs/, and the "Contact note" data
 * structure in https://github.com/nimblecrm/api-docs
 * (docs/data_structures/contacts/note.rst):
 *   id        "Id of the note."
 *   note      "Note content with all formatting mark up in place"
 *   contacts  "List of objects that are a shortened contact data view"
 *             (Contacts.ShortContact: id, contact_type enum person | company)
 *   owner_id  "Id of company user who created this note"
 *   created   "Date and time when the note was created encoded in ISO 8601"
 *   updated   "Date and time when the note was updated encoded in ISO 8601"
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawNimbleShortContact {
  id: string
  contact_type?: 'person' | 'company'
  [key: string]: unknown
}

export interface RawNimbleNote {
  id: string
  note: string
  contacts?: RawNimbleShortContact[]
  owner_id?: string
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformNote(raw: RawNimbleNote): Note {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Nimble: note response has no id')
  }
  if (typeof raw.note !== 'string') {
    throw new Error(`Nimble: note ${raw.id} has no note content`)
  }
  const person = raw.contacts?.find((c) => c.contact_type === 'person')
  const company = raw.contacts?.find((c) => c.contact_type === 'company')
  return {
    id: raw.id,
    content: raw.note,
    contact_id: person?.id,
    company_id: company?.id,
    owner_id: raw.owner_id,
    created_at: toIsoDatetime(raw.created),
    updated_at: toIsoDatetime(raw.updated),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.contact_id !== undefined) out.contact_ids = [data.contact_id]
  return out
}
