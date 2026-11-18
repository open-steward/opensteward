import type { Note } from '../../../schema/note'

export interface RawZohoNote {
  id: string
  Note_Title?: string
  Note_Content?: string
  Parent_Id?: { id: string; name?: string } | null
  se_module?: string
  Owner?: { id: string; name?: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformNote(raw: RawZohoNote): Note {
  const isContact = raw.se_module === 'Contacts'
  const isDeal = raw.se_module === 'Deals'
  const parentId = raw.Parent_Id?.id != null ? String(raw.Parent_Id.id) : undefined

  return {
    id: String(raw.id),
    content: raw.Note_Content ?? raw.Note_Title ?? '',
    contact_id: isContact ? parentId : undefined,
    deal_id: isDeal ? parentId : undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  if (data.content !== undefined) record.Note_Content = data.content
  if (data.contact_id !== undefined) {
    record.Parent_Id = { id: data.contact_id }
    record.se_module = 'Contacts'
  } else if (data.deal_id !== undefined) {
    record.Parent_Id = { id: data.deal_id }
    record.se_module = 'Deals'
  }
  return record
}
