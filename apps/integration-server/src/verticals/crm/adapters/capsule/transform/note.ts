import type { Note } from '../../../schema/note'

export interface RawCapsuleNote {
  id: number | string
  type?: string
  content?: string
  party?: { id: number | string } | null
  opportunity?: { id: number | string } | null
  author?: { id: number | string } | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawCapsuleNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.party?.id != null ? String(raw.party.id) : undefined,
    deal_id: raw.opportunity?.id != null ? String(raw.opportunity.id) : undefined,
    owner_id: raw.author?.id != null ? String(raw.author.id) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'note' }
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.party = { id: Number(data.contact_id) }
  if (data.deal_id !== undefined) out.opportunity = { id: Number(data.deal_id) }
  return out
}
