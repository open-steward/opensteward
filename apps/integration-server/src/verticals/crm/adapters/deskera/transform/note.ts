import type { Note } from '../../../schema/note'

export interface RawDeskeraNote {
  id: string | number
  content?: string
  contactId?: string | number
  dealId?: string | number
  ownerId?: string | number
  createdAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawDeskeraNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: raw.createdAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
