import type { Note } from '../../../schema/note'

// Kylas CRM note entity
export interface RawKylasNote {
  id: number
  content?: string
  description?: string
  contactId?: number
  companyId?: number
  dealId?: number
  ownedBy?: { id?: number }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawKylasNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? raw.description ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.ownedBy?.id != null ? String(raw.ownedBy.id) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contactId = Number(data.contact_id)
  if (data.company_id !== undefined) out.companyId = Number(data.company_id)
  if (data.deal_id !== undefined) out.dealId = Number(data.deal_id)
  return out
}
