import type { Note } from '../../../schema/note'

// ── Raw Folk types ─────────────────────────────────────────────────────────
//
// `components.schemas.Note` in https://developer.folk.app/schemas/2025-06-09.json
// (GET /v1/notes items, GET /v1/notes/{noteId} data). Only the fields the
// transform reads are typed; the rest ride along in metadata.

export interface RawFolkNote {
  id: string
  content: string
  /** "The type of the entity connected to the note. Can be `person`, `company` or `object`." */
  entity?: { id: string; entityType: 'person' | 'company' | 'object'; fullName: string }
  /** A user (`type: 'user'`, with `id`) or a folk assistant (`type: 'assistant'`, no id). */
  author?: { type: 'user' | 'assistant'; id?: string; [key: string]: unknown }
  /** ISO date-time; nullable in the spec. */
  createdAt?: string | null
  [key: string]: unknown
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformNote(raw: RawFolkNote): Note {
  const entity = raw.entity
  return {
    id: String(raw.id),
    content: raw.content,
    contact_id: entity?.entityType === 'person' ? entity.id : undefined,
    company_id: entity?.entityType === 'company' ? entity.id : undefined,
    // `object` entities are custom group objects (deals among them); the
    // note does not say which, so no deal_id is inferred.
    owner_id: raw.author?.type === 'user' && raw.author.id ? raw.author.id : undefined,
    created_at: raw.createdAt ?? undefined,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['content'] = data.content
  if (data.contact_id !== undefined) out['contactId'] = data.contact_id
  return out
}
