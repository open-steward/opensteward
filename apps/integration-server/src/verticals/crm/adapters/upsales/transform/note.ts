import type { Note } from '../../../schema/note'

export interface RawUpsalesNote {
  id: number | string
  description?: string
  contactId?: number | string
  clientId?: number | string
  opportunityId?: number | string
  userId?: number | string
  regDate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawUpsalesNote): Note {
  return {
    id: String(raw.id),
    content: raw.description ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.clientId != null ? String(raw.clientId) : undefined,
    deal_id: raw.opportunityId != null ? String(raw.opportunityId) : undefined,
    owner_id: raw.userId != null ? String(raw.userId) : undefined,
    created_at: raw.regDate,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.description = data.content
  if (data.contact_id !== undefined) out.contactId = Number(data.contact_id)
  if (data.company_id !== undefined) out.clientId = Number(data.company_id)
  if (data.deal_id !== undefined) out.opportunityId = Number(data.deal_id)
  if (data.owner_id !== undefined) out.userId = Number(data.owner_id)
  return out
}
