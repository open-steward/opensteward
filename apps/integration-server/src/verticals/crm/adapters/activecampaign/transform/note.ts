import type { Note } from '../../../schema/note'

export interface RawActiveCampaignNote {
  id: string | number
  note: string
  relid?: string | number | null
  reltype?: string | null
  userid?: string | number | null
  cdate?: string
  mdate?: string
  [key: string]: unknown
}

export function transformNote(raw: RawActiveCampaignNote): Note {
  const isSubscriber = raw.reltype === 'Subscriber'
  const isDeal = raw.reltype === 'Deal'
  return {
    id: String(raw.id),
    content: raw.note,
    contact_id: isSubscriber && raw.relid != null ? String(raw.relid) : undefined,
    deal_id: isDeal && raw.relid != null ? String(raw.relid) : undefined,
    owner_id: raw.userid != null && raw.userid !== '' ? String(raw.userid) : undefined,
    created_at: raw.cdate ?? undefined,
    updated_at: raw.mdate ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.contact_id !== undefined) {
    out.relid = data.contact_id
    out.reltype = 'Subscriber'
  } else if (data.deal_id !== undefined) {
    out.relid = data.deal_id
    out.reltype = 'Deal'
  }
  if (data.owner_id !== undefined) out.userid = data.owner_id
  return out
}
