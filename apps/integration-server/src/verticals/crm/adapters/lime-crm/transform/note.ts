import type { Note } from '../../../schema/note'

export interface RawLimeCrmNote {
  _id: string
  content?: string
  contactId?: string
  companyId?: string
  dealId?: string
  ownerId?: string
  _createdtime?: string
  [key: string]: unknown
}

export function transformNote(raw: RawLimeCrmNote): Note {
  return {
    id: String(raw._id),
    content: raw.content ?? '',
    contact_id: raw.contactId ? String(raw.contactId) : undefined,
    company_id: raw.companyId ? String(raw.companyId) : undefined,
    deal_id: raw.dealId ? String(raw.dealId) : undefined,
    owner_id: raw.ownerId ? String(raw.ownerId) : undefined,
    created_at: raw._createdtime,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
