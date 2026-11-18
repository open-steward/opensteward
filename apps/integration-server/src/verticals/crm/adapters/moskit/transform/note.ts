import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

/**
 * Note.v2.yaml ("Nota"): id, description, dateCreated, user (EntityId), source.
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Note.v2.yaml
 */
export interface RawMoskitNote {
  id: number
  description?: string
  dateCreated?: string
  user?: { id?: number } | null
  source?: string
  [key: string]: unknown
}

/** The record a note is listed under: GET /deals|contacts|companies/{id}/notes. */
export type MoskitNoteParentKind = 'deal' | 'contact' | 'company'
export interface MoskitNoteParent {
  kind: MoskitNoteParentKind
  id: string
}

/**
 * Notes exist only under a parent (`/deals/{dealId}/notes/{id}`, and the same
 * for contacts and companies), and reading one back needs both ids. The
 * canonical id is therefore `<kind>:<parentId>:<noteId>`, which getNote parses.
 */
export function noteId(parent: MoskitNoteParent, id: string | number): string {
  return `${parent.kind}:${parent.id}:${id}`
}

export function parseNoteId(id: string): { parent: MoskitNoteParent; noteId: string } | undefined {
  const m = /^(deal|contact|company):([^:]+):([^:]+)$/.exec(id)
  if (!m) return undefined
  return { parent: { kind: m[1] as MoskitNoteParentKind, id: m[2]! }, noteId: m[3]! }
}

/**
 * `parent` is absent only for the write methods, which still call an
 * undocumented top-level /notes path; their ids cannot be read back.
 */
export function transformNote(raw: RawMoskitNote, parent?: MoskitNoteParent): Note {
  return {
    id: parent ? noteId(parent, raw.id) : String(raw.id),
    content: raw.description ?? '',
    deal_id: parent?.kind === 'deal' ? parent.id : undefined,
    contact_id: parent?.kind === 'contact' ? parent.id : undefined,
    company_id: parent?.kind === 'company' ? parent.id : undefined,
    owner_id: raw.user?.id != null ? String(raw.user.id) : undefined,
    created_at: toIsoDatetime(raw.dateCreated),
    metadata: raw,
  }
}
export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.contact = { id: data.contact_id }
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  if (data.deal_id !== undefined) out.deal = { id: data.deal_id }
  if (data.owner_id !== undefined) out.owner = { id: data.owner_id }
  return out
}
