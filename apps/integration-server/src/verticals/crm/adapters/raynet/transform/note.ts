import type { Note } from '../../../schema/note'

export interface RawRaynetNote {
  id?: number
  text?: string
  contact?: { id?: number }
  account?: { id?: number }
  businessCase?: { id?: number }
  owner?: { id?: number }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawRaynetNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.text ?? '',
    contact_id: raw.contact?.id != null ? String(raw.contact.id) : undefined,
    company_id: raw.account?.id != null ? String(raw.account.id) : undefined,
    deal_id: raw.businessCase?.id != null ? String(raw.businessCase.id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.contact = { id: Number(data.contact_id) }
  if (data.company_id !== undefined) out.account = { id: Number(data.company_id) }
  if (data.deal_id !== undefined) out.businessCase = { id: Number(data.deal_id) }
  return out
}
