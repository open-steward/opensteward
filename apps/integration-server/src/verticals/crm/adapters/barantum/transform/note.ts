import type { Note } from '../../../schema/note'
import { requireUuid, text } from './fields'

/**
 * A row of the Notes module, as `POST /api/get_list_data` with
 * `"module": "Notes"` returns it in `result.content[]`.
 *
 * Docs: https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5
 * ("[Notes] Get Data", Expected Response; the Notes module's key fields
 * table: "notes_name | Yes | Note title", "notes_description | Optional |
 * Note content", "related_contacts_uuid | Optional | UUID of the related
 * Contact", "related_org_uuid | Optional | UUID of the related Org",
 * "related_deals_uuid | Optional | UUID of the related Deal").
 *
 * `content` is the documented note content, `notes_description`, and is ""
 * when that optional field is unset; the title stays in `metadata`.
 * Timestamps carry no zone and the docs name none, so they are not mapped.
 */
export interface RawBarantumNote {
  notes_uuid: string
  notes_description?: string | null
  related_contacts_uuid?: string | null
  related_org_uuid?: string | null
  related_deals_uuid?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawBarantumNote): Note {
  return {
    id: requireUuid(raw, 'notes_uuid', 'Notes'),
    content: text(raw.notes_description) ?? '',
    contact_id: text(raw.related_contacts_uuid),
    company_id: text(raw.related_org_uuid),
    deal_id: text(raw.related_deals_uuid),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.deal_id !== undefined) out.deal_id = data.deal_id
  return out
}
