import type { Note } from '../../../schema/note'

/**
 * Method CRM Note table raw record shape.
 *
 * Table name  : Note
 * Key fields  : RecordId, NoteText (or Content), ContactRecordID,
 *               OpportunityRecordID, CreatedDate, ModifiedDate
 *
 * Notes in Method CRM are attached to Contacts and/or Opportunities.
 */
export interface RawMethodNote {
  RecordId: string | number
  NoteText?: string
  Content?: string
  ContactRecordID?: string | number
  OpportunityRecordID?: string | number
  CreatedDate?: string
  ModifiedDate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawMethodNote): Note {
  // Method CRM may use NoteText or Content for the note body
  const body =
    (typeof raw.NoteText === 'string' ? raw.NoteText : undefined) ??
    (typeof raw.Content === 'string' ? raw.Content : undefined) ??
    ''

  return {
    id: String(raw.RecordId),
    content: body,
    contact_id:
      raw.ContactRecordID !== undefined && raw.ContactRecordID !== null
        ? String(raw.ContactRecordID)
        : undefined,
    deal_id:
      raw.OpportunityRecordID !== undefined && raw.OpportunityRecordID !== null
        ? String(raw.OpportunityRecordID)
        : undefined,
    created_at: typeof raw.CreatedDate === 'string' ? raw.CreatedDate : undefined,
    updated_at: typeof raw.ModifiedDate === 'string' ? raw.ModifiedDate : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.NoteText = data.content
  if (data.contact_id !== undefined) out.ContactRecordID = data.contact_id
  if (data.deal_id !== undefined) out.OpportunityRecordID = data.deal_id
  return out
}
