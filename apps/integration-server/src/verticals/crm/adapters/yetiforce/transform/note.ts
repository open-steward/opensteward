import type { Note } from '../../../schema/note'
import { refId, wallTimeToIso } from '../dates'

/**
 * A ModComments record's raw data (`x-raw-data: 1`), keyed by field name.
 *
 * Field names are the `fieldname` column of YetiForce's install schema for
 * the ModComments module (tabid 40), install/install_schema/data.sql in
 * github.com/YetiForceCompany/YetiForceCRM: commentcontent (mandatory,
 * V~M), assigned_user_id, createdtime, modifiedtime. `related_to` is not
 * mapped: it references some thirty modules (vtiger_fieldmodulerel), so the
 * raw id alone does not say whether it is a contact, company or deal.
 */
export type RawYetiForceNote = Record<string, unknown>

/** Fields the ModComments list asks for with `x-fields`. */
export const NOTE_FIELDS = [
  'commentcontent',
  'assigned_user_id',
  'createdtime',
  'modifiedtime',
] as const

export function transformNote(id: string, raw: RawYetiForceNote, rawTimeZone: string): Note {
  const content = raw['commentcontent']
  if (typeof content !== 'string') {
    throw Object.assign(new Error(`YetiForce comment ${id} has no commentcontent`), {
      statusCode: 502,
    })
  }
  return {
    id,
    content,
    owner_id: refId(raw['assigned_user_id']),
    created_at: wallTimeToIso(raw['createdtime'], rawTimeZone),
    updated_at: wallTimeToIso(raw['modifiedtime'], rawTimeZone),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['commentcontent'] = data.content
  if (data.contact_id !== undefined) {
    out['related_id'] = data.contact_id
    out['related_module'] = 'Contacts'
  }
  if (data.deal_id !== undefined) {
    out['related_id'] = data.deal_id
    out['related_module'] = 'Opportunities'
  }
  return out
}
