import type { Note } from '../../../schema/note'

export interface RawAffinityNote {
  id: number
  content: string
  person_ids?: number[]
  opportunity_ids?: number[]
  creator_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawAffinityNote): Note {
  return {
    id: String(raw.id),
    content: raw.content,
    contact_id: raw.person_ids?.[0] != null ? String(raw.person_ids[0]) : undefined,
    deal_id: raw.opportunity_ids?.[0] != null ? String(raw.opportunity_ids[0]) : undefined,
    owner_id: raw.creator_id != null ? String(raw.creator_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.person_ids = [Number(data.contact_id)]
  if (data.deal_id !== undefined) out.opportunity_ids = [Number(data.deal_id)]
  return out
}
