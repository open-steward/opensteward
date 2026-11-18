import type { Note } from '../../../schema/note'

export interface RawCreatioNote {
  Id: string
  Title?: string
  Notes?: string
  OwnerId?: string | null
  ContactId?: string | null
  OpportunityId?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawCreatioNote): Note {
  return {
    id: String(raw.Id),
    content: raw.Notes ?? raw.Title ?? '',
    contact_id: raw.ContactId ?? undefined,
    deal_id: raw.OpportunityId ?? undefined,
    owner_id: raw.OwnerId ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Notes = data.content
  if (data.contact_id !== undefined) out.ContactId = data.contact_id
  if (data.deal_id !== undefined) out.OpportunityId = data.deal_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
