import type { Note } from '../../../schema/note'

// ── Raw Attio types ────────────────────────────────────────────────────────

interface AttioNoteId {
  note_id: string
  created_at?: string
}

interface AttioActorRef {
  id?: string
  type?: string
}

export interface RawAttioNote {
  id: AttioNoteId
  title?: string
  content_plaintext?: string
  parent_object?: string
  parent_record_id?: string
  created_by_actor?: AttioActorRef
  created_at?: string
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformNote(raw: RawAttioNote): Note {
  return {
    id: String(raw.id.note_id),
    content: raw.content_plaintext ?? raw.title ?? '',
    contact_id: raw.parent_object === 'people' && raw.parent_record_id
      ? String(raw.parent_record_id)
      : undefined,
    deal_id: raw.parent_object === 'deals' && raw.parent_record_id
      ? String(raw.parent_record_id)
      : undefined,
    owner_id: raw.created_by_actor?.id
      ? String(raw.created_by_actor.id)
      : undefined,
    created_at: raw.id.created_at ?? raw.created_at,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    content_plaintext: data.content ?? '',
  }

  if (data.contact_id !== undefined) {
    body['parent_object'] = 'people'
    body['parent_record_id'] = data.contact_id
  } else if (data.deal_id !== undefined) {
    body['parent_object'] = 'deals'
    body['parent_record_id'] = data.deal_id
  }

  return { data: body }
}
