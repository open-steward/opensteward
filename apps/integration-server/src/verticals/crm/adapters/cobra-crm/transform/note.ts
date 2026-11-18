import type { Note } from '../../../schema/note'

// TODO: verify field names against Cobra CRM API docs (German/Dutch language)
export interface RawCobraCrmNote {
  id: string | number
  content?: string
  contactId?: string | number | null
  companyId?: string | number | null
  dealId?: string | number | null
  ownerId?: string | number | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawCobraCrmNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: raw.createdAt ?? undefined,
    updated_at: raw.updatedAt ?? undefined,
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
