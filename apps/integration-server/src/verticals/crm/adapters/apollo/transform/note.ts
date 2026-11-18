import type { Note } from '../../../schema/note'

export interface RawApolloNote {
  id: string
  content: string
  contact_id?: string | null
  account_id?: string | null
  creator_id?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawApolloNote): Note {
  return {
    id: String(raw.id),
    content: raw.content,
    contact_id: raw.contact_id ?? undefined,
    company_id: raw.account_id ?? undefined,
    owner_id: raw.creator_id ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.company_id !== undefined) out.account_id = data.company_id
  return out
}
