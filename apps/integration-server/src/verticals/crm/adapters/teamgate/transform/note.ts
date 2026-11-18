import type { Note } from '../../../schema/note'

/**
 * Teamgate does not expose a dedicated Notes endpoint in the v4 public API.
 * Notes are returned as comment objects nested within leads/deals/people.
 * This transform handles the generic comment/note shape returned by those
 * nested resources when accessed as stand-alone objects.
 *
 * Fields: id, content (or body/text), createdTime, updatedTime, ownerId
 */
export interface RawTeamgateNote {
  id: number | string
  content?: string
  body?: string
  text?: string
  contactId?: number | string | null
  dealId?: number | string | null
  ownerId?: number | string | null
  createdTime?: string
  updatedTime?: string
  [key: string]: unknown
}

function toIso(ts: string | undefined): string | undefined {
  if (!ts) return undefined
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  } catch {
    return undefined
  }
}

export function transformNote(raw: RawTeamgateNote): Note {
  const body =
    typeof raw.content === 'string' ? raw.content
    : typeof raw.body === 'string' ? raw.body
    : typeof raw.text === 'string' ? raw.text
    : ''

  return {
    id: String(raw.id),
    content: body,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    deal_id: raw.dealId != null ? String(raw.dealId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: toIso(raw.createdTime),
    updated_at: toIso(raw.updatedTime),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.deal_id !== undefined) out.dealId = data.deal_id
  return out
}
