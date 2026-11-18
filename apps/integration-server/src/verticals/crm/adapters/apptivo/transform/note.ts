import type { Note } from '../../../schema/note'

export interface RawApptivoNote {
  noteId?: string
  id?: string
  description?: string
  text?: string
  contactId?: string | null
  customerId?: string | null
  opportunityId?: string | null
  assigneeId?: string | null
  createdDate?: string | null
  modifiedDate?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawApptivoNote): Note {
  const id = raw.noteId ?? raw.id ?? ''
  return {
    id: String(id),
    content: raw.description ?? raw.text ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.customerId != null ? String(raw.customerId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.assigneeId != null ? String(raw.assigneeId) : undefined,
    created_at: raw.createdDate ?? undefined,
    updated_at: raw.modifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.description = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.customerId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.owner_id !== undefined) out.assigneeId = data.owner_id
  return out
}
