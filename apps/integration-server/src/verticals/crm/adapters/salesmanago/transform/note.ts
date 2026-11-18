import type { Note } from '../../../schema/note'

export interface RawSaleSmanagoNote {
  id?: string
  note?: string
  contactId?: string
  ownerId?: string
  createdOn?: number
  modifiedOn?: number
  [key: string]: unknown
}

export function transformNote(raw: RawSaleSmanagoNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: (raw.note as string | undefined) ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    owner_id: raw.ownerId as string | undefined,
    created_at: raw.createdOn != null ? new Date(raw.createdOn as number).toISOString() : undefined,
    updated_at: raw.modifiedOn != null ? new Date(raw.modifiedOn as number).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  return out
}
