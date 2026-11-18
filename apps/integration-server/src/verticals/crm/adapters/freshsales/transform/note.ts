import type { Note } from '../../../schema/note'

export interface RawFreshsalesNote {
  id: number
  description?: string
  targetable_id?: number | null
  targetable_type?: string
  owner_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawFreshsalesNote): Note {
  return {
    id: String(raw.id),
    content: raw.description ?? '',
    contact_id:
      raw.targetable_type === 'Contact' && raw.targetable_id != null
        ? String(raw.targetable_id)
        : undefined,
    deal_id:
      raw.targetable_type === 'Deal' && raw.targetable_id != null
        ? String(raw.targetable_id)
        : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.description = data.content
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.contact_id !== undefined) {
    out.targetable_id = Number(data.contact_id)
    out.targetable_type = 'Contact'
  } else if (data.deal_id !== undefined) {
    out.targetable_id = Number(data.deal_id)
    out.targetable_type = 'Deal'
  }
  return out
}
