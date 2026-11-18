import type { Note } from '../../../schema/note'

export interface RawZendeskSellNote {
  id: number
  content: string
  resource_type?: string
  resource_id?: number | null
  creator_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawZendeskSellNote): Note {
  const isContact = raw.resource_type === 'contact' || raw.resource_type === 'Contact'
  const isDeal = raw.resource_type === 'deal' || raw.resource_type === 'Deal'
  return {
    id: String(raw.id),
    content: raw.content,
    contact_id: isContact && raw.resource_id != null ? String(raw.resource_id) : undefined,
    deal_id: isDeal && raw.resource_id != null ? String(raw.resource_id) : undefined,
    owner_id: raw.creator_id != null ? String(raw.creator_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) {
    out.resource_type = 'contact'
    out.resource_id = Number(data.contact_id)
  } else if (data.deal_id !== undefined) {
    out.resource_type = 'deal'
    out.resource_id = Number(data.deal_id)
  }
  return out
}
