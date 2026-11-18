import type { Note } from '../../../schema/note'

export interface RawBrevoNote {
  id?: string
  text?: string
  // Links are arrays — a note can be attached to more than one record.
  contactIds?: number[]
  companyIds?: string[]
  dealIds?: string[]
  // authorId is the author's user object, not a bare id.
  authorId?: {
    id?: string
    email?: string
    name?: { fullName?: string }
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawBrevoNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.text ?? '',
    contact_id: raw.contactIds?.[0] != null ? String(raw.contactIds[0]) : undefined,
    company_id: raw.companyIds?.[0],
    deal_id: raw.dealIds?.[0],
    owner_id: raw.authorId?.id,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.contactIds = [Number(data.contact_id)]
  if (data.company_id !== undefined) out.companyIds = [data.company_id]
  if (data.deal_id !== undefined) out.dealIds = [data.deal_id]
  return out
}
