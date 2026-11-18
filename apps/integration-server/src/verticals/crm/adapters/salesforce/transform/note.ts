import type { Note } from '../../../schema/note'

export interface RawSalesforceNote {
  Id: string
  Title?: string | null
  Body?: string | null
  ParentId?: string | null
  OwnerId?: string | null
  CreatedDate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSalesforceNote): Note {
  return {
    id: String(raw.Id),
    content: raw.Body ?? raw.Title ?? '',
    contact_id: undefined,   // ParentId is resolved at adapter level; unknown parent type here
    owner_id: raw.OwnerId ?? undefined,
    created_at: raw.CreatedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.Body = data.content
  if (data.contact_id !== undefined) out.ParentId = data.contact_id
  if (data.deal_id !== undefined) out.ParentId = data.deal_id
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
