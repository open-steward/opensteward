/**
 * Note transform: Vendasta CRM Note Activity <-> OpenSteward canonical Note.
 *
 * In Vendasta, notes are a subtype of activity objects with:
 *   system__activity_activity_type = "note"
 *
 * Relevant Vendasta field IDs:
 *   system__activity_id          — unique note ID (read-only)
 *   standard__activity_note      — note body / content
 *   standard__activity_note_title — optional title
 *   system__activity_owner_id    — author / owner user ID
 *   system__activity_source_id   — linked contact ID (source object)
 *   system__activity_created     — ISO datetime (read-only)
 *   system__activity_updated     — ISO datetime (read-only)
 */

import type { Note } from '../../../schema/note'
import {
  type VendastaCrmObject,
  type VendastaFieldValue,
  getField,
  strField,
} from '../client'

export type RawVendastaNote = VendastaCrmObject

export function transformNote(raw: RawVendastaNote): Note {
  const f = raw.fields ?? []
  const id = raw.crmObjectId ?? getField(f, 'system__activity_id') ?? ''

  return {
    id: String(id),
    content:    getField(f, 'standard__activity_note') ?? '',
    contact_id: getField(f, 'system__activity_source_id'),
    owner_id:   raw.ownerId ?? getField(f, 'system__activity_owner_id'),
    created_at: raw.created,
    updated_at: raw.updated,
    metadata:   raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): VendastaFieldValue[] {
  const fields: VendastaFieldValue[] = []
  const push = (fv: VendastaFieldValue | null) => { if (fv) fields.push(fv) }

  push(strField('standard__activity_note', data.content ?? undefined))
  push(strField('system__activity_activity_type', 'note'))

  if (data.contact_id) {
    push(strField('system__activity_source_id', data.contact_id))
  }

  return fields
}
