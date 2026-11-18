import type { Note } from '../../../schema/note'

export interface RawActNote {
  id?: string
  noteId?: string
  noteText?: string
  text?: string
  contactId?: string | null
  companyId?: string | null
  opportunityId?: string | null
  managerId?: string | null
  created?: string | null
  edited?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawActNote): Note {
  const id = raw.id ?? raw.noteId ?? ''
  return {
    id: String(id),
    content: raw.noteText ?? raw.text ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.managerId != null ? String(raw.managerId) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.edited ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.noteText = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.deal_id !== undefined) out.opportunityId = data.deal_id
  if (data.owner_id !== undefined) out.managerId = data.owner_id
  return out
}
