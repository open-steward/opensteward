import type { Note } from '../../../schema/note'

export interface RawInsightlyNote {
  NOTE_ID: number
  TITLE?: string
  BODY?: string
  CONTACT_ID?: number | null
  OPPORTUNITY_ID?: number | null
  OWNER_USER_ID?: number | null
  DATE_CREATED_UTC?: string
  DATE_UPDATED_UTC?: string
  [key: string]: unknown
}

function isoUtc(date?: string): string | undefined {
  if (!date) return undefined
  return date.endsWith('Z') ? date : `${date}Z`
}

export function transformNote(raw: RawInsightlyNote): Note {
  return {
    id: String(raw.NOTE_ID),
    content: raw.BODY ?? raw.TITLE ?? '',
    contact_id: raw.CONTACT_ID != null ? String(raw.CONTACT_ID) : undefined,
    deal_id: raw.OPPORTUNITY_ID != null ? String(raw.OPPORTUNITY_ID) : undefined,
    owner_id: raw.OWNER_USER_ID != null ? String(raw.OWNER_USER_ID) : undefined,
    created_at: isoUtc(raw.DATE_CREATED_UTC),
    updated_at: isoUtc(raw.DATE_UPDATED_UTC),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) {
    out.TITLE = data.content
    out.BODY = data.content
  }
  if (data.contact_id !== undefined) out.CONTACT_ID = Number(data.contact_id)
  if (data.deal_id !== undefined) out.OPPORTUNITY_ID = Number(data.deal_id)
  if (data.owner_id !== undefined) out.OWNER_USER_ID = Number(data.owner_id)
  return out
}
